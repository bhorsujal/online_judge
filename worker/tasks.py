import os
import json
import subprocess
import httpx
import shutil
from celery import Celery, shared_task
from celery.schedules import timedelta
from redis import Redis
from dotenv import load_dotenv
import base64
import re

load_dotenv(".env")
# Redis configuration
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 0))
RUN_QUEUE = os.getenv('RUN_QUEUE', 'runQueue')
SUBMIT_QUEUE = os.getenv('SUBMIT_QUEUE', 'submitQueue')

# Webhook configuration
WEB_HOOK_URL = os.getenv('WEB_HOOK_URL', "http://localhost:3000/api/webhook")

# Celery configuration
app = Celery('tasks', broker=f'redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}')
app.conf.broker_url = f'redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}'
app.conf.result_backend = f'redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}'

app.conf.broker_connection_retry_on_startup = True

# Redis client
redis_client = Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)

LANGUAGE_CONFIG = {
    'python': {
        'extension': '.py',
        'image': 'python:3.9-alpine',
        'run_cmd': 'python {filename}',
        'timeout': 4,
    },
    'cpp': {
        'extension': '.cpp',
        'image': 'gcc:alpine',
        'compile_cmd': 'g++ -o {exec_name} {filename}',
        'run_cmd': './{exec_name}',
        'timeout': 2,
    },
    'c++': {  # Alias for cpp
        'extension': '.cpp',
        'image': 'gcc:alpine',
        'compile_cmd': 'g++ -o {exec_name} {filename}',
        'run_cmd': './{exec_name}',
        'timeout': 2,
    },
    'java': {
        'extension': '.java',
        'image': 'openjdk:11-jdk-alpine',
        'compile_cmd': 'javac {filename}',
        'run_cmd': 'java {classname}',
        'timeout': 2,
    },
    'javascript': {
        'extension': '.js',
        'image': 'node:14-alpine',
        'run_cmd': 'node {filename}',
        'timeout': 4,
    },
}


def run_code_in_docker(code, language, submission_id, test_case_paths, expected_output_paths, customTestcase, event):
    try:
        results = {
            "status": "accepted",
            "message": "All testcases passed",
            "results": ""
        }

        if language not in LANGUAGE_CONFIG:
            return {"status": "failed", "message": "Unsupported programming language"}
        
        config = LANGUAGE_CONFIG[language]
        extension = config.get('extension', '')
        image = config['image']
        timeout = config['timeout']
        
        if language == 'java':
            filename = f"Main.java"
            classname = "Main"
        else:
            filename = f"subimssion_{submission_id}{extension}"
            classname = filename[:-5]
            

        work_dir = os.path.join(os.getcwd(), "..", "problems", f"submission_{submission_id}")
        output_dir = os.path.join(work_dir, "outputs")
        input_dir = os.path.join(work_dir, "inputs")
        expected_output_dir = os.path.join(work_dir, "exp_outputs")
        os.makedirs(work_dir, exist_ok=True)
        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(expected_output_dir, exist_ok=True)
        
        with open(os.path.join(work_dir, filename), "w") as f:
            f.write(code)

         # Handle custom testcase
        if customTestcase:
            with open(os.path.join(input_dir, 'custom_input.txt'), 'w') as f:
                f.write(customTestcase)

            test_case_paths = [os.path.join(input_dir, 'custom_input.txt')]
            expected_output_paths = []
        else:
            for i, (test_case, expected_output) in enumerate(zip(test_case_paths, expected_output_paths)):
                shutil.copy(test_case, os.path.join(input_dir, f'in{i}.txt'))
                shutil.copy(expected_output, os.path.join(expected_output_dir, f'out{i}.txt'))

        if language in ["cpp", "c++", "java"]:
            compile_cmd = config['compile_cmd'].format(
                filename=filename,
                exec_name=f"{filename}_exec",
                classname=classname # For Java, filename is Main.java
            )

            compile_result = subprocess.run(
                f"docker run --rm -v {work_dir}:/app -w /app {image} {compile_cmd}",
                shell=True, capture_output=True, text=True
            )
            if compile_result.returncode != 0:
                error_message = compile_result.stderr
                error_lines = error_message.split('\n')
                relevant_errors = [line for line in error_lines if re.search(r'error|warning', line)]
                formatted_error = '\n'.join(relevant_errors)
                return {
                    "status": "compilation_error",
                    "message": f"Compilation failed.",
                    "results": f"{formatted_error}"
                }
            
        final_correct_result = ""

        for i in range(len(test_case_paths)):
            run_cmd = config['run_cmd'].format(
                filename=filename,
                exec_name=f"{filename}_exec",
                classname=filename[:-5]
            )

            input_file = f'custom_input.txt' if customTestcase else f'in{i}.txt'
            output_file = f'custom_output.txt' if customTestcase else f'output_{i}.txt'
            
            try:
                run_result = subprocess.run(
                    f"docker run --rm --memory=256m --cpus=1 -v {work_dir}:/app -w /app {image} "
                    f"sh -c 'timeout {timeout}s {run_cmd} < inputs/{input_file} | tee outputs/{output_file}'",
                    shell=True, capture_output=True, text=True,timeout=timeout+5
                )

                if run_result.returncode == 124:
                    return {
                        "status": "time_limit_exceeded",
                        "message": f"Execution time exceeded {timeout} seconds on testcase {i}."
                    }
                elif run_result.returncode != 0:
                    error_message = run_result.stderr
                    return {
                        "status": "runtime_error",
                        "message": f"Runtime error occurred on testcase {i}",
                        "results": error_message
                    }

                if not customTestcase:
                    with open(os.path.join(output_dir, f"output_{i}.txt"), "r") as f_output, \
                        open(os.path.join(expected_output_dir, f"out{i}.txt"), "r") as f_expected:
                        if f_output.read().strip() != f_expected.read().strip():
                            return {"status": "wrong_answer", "message": f"Failed on testcase {i}.", "results": run_result.stdout}

                final_correct_result = run_result.stdout
            
            except subprocess.TimeoutExpired:
                return {
                    "status": "time_limit_exceeded",
                    "message": f"Execution time exceeded {timeout} seconds on testcase {i}."
                }

        results['results'] = final_correct_result
        return results
    except Exception as e:
        print("Error in running in docker", e)
        return {"status": "pending", "message": "Unexpected error occurred", "results": str(e)}
    finally:
        if os.path.exists(work_dir):
            shutil.rmtree(work_dir)


def run_customTestcase_in_docker(submission_id, problem_id, customTestcase):
    try:
        results = {
            "status": "",
            "message": "",
            "results": ""
        }
        config = LANGUAGE_CONFIG['c++']
        image = config['image']
        timeout = config['timeout']
        
        # Convert submission_id and problem_id to strings
        filename = f"{str(problem_id)}"
        work_dir = os.path.join(os.getcwd(), "..", "problems", f"submission_{str(submission_id)}")
        input_dir = os.path.join(work_dir, "inputs")
        
        # Create directories if not existing
        os.makedirs(work_dir, exist_ok=True)
        os.makedirs(input_dir, exist_ok=True)

        # Write custom test case to file
        with open(os.path.join(input_dir, 'custom_input.txt'), 'w') as f:
            f.write(customTestcase)

        # Copy the solution source code to the work directory
        sol_source = os.path.join(os.getcwd(), "..", "problems", str(problem_id), "solution.cpp")
        exec_dest = os.path.join(work_dir, f"{filename}.cpp")
        shutil.copy(sol_source, exec_dest)

        # Ensure the copied solution has the right permissions (for Docker run)
        os.chmod(exec_dest, 0o755)

        input_file = 'custom_input.txt'
        exec_name = f"{filename}_exec"
        cpp_file = f"{filename}.cpp"
        
        # Docker compilation and execution commands
        compile_cmd = f"g++ -o {exec_name} {cpp_file}"
        run_cmd = f"./{exec_name} < inputs/{input_file}"

        # Print custom test case for debugging
        print(f'Custom Testcase : {customTestcase}')

        # Run the Docker container to compile and execute the solution
        docker_cmd = [
            "docker", "run", "--rm", "--memory=256m", "--cpus=1",
            "-v", f"{work_dir}:/app", "-w", "/app", image,
            "sh", "-c", f"{compile_cmd} && timeout {timeout}s {run_cmd}"
        ]

        # Execute the Docker command
        run_result = subprocess.run(
            docker_cmd,
            capture_output=True,
            text=True,
        )

        # Check for time limit exceeded
        if run_result.returncode == 124:
            return {
                "status": "time_limit_exceeded",
                "message": f"Execution time exceeded {timeout} seconds on testcase."
            }
        # Check for other runtime errors
        elif run_result.returncode != 0:
            error_message = run_result.stderr
            return {
                "status": "runtime_error",
                "message": f"Runtime error occurred on the testcase",
                "results": error_message
            }

        # Return 'accepted' as status for a successful run
        results = run_result.stdout
        return {
            "status": "accepted",  # Mapping 'success' to 'accepted' for valid enum
            "message": "Custom test case executed successfully.",
            "results": results
        }
    except Exception as e:
        print(f"Error in running Docker: {e}")
        return {"status": "pending", "message": "Unexpected error occurred", "results": str(e)}
    finally:
        # Optional cleanup (uncomment if necessary)
        if os.path.exists(work_dir):
            shutil.rmtree(work_dir)
        # pass
       

@app.task
def execute_program(submission, mode='run'):
    try:
        customTestcase = submission.get('customTestcase', '')

        if mode == 'submit':
            num_test_cases = 6
            test_case_paths = [f"../problems/{submission['problem_id']}/in{i}.txt" for i in range(num_test_cases)]
            expected_output_paths = [f"../problems/{submission['problem_id']}/out{i}.txt" for i in range(num_test_cases)]
        else:  # mode == 'run'
            if customTestcase:
                test_case_paths = []
                expected_output_paths = []
            else:
                test_case_paths = [f"../problems/{submission['problem_id']}/in0.txt"]
                expected_output_paths = [f"../problems/{submission['problem_id']}/out0.txt"]
        
        if submission['event'] == 'RC' and customTestcase and mode=='run':
            results = run_customTestcase_in_docker(
                submission['submission_id'],
                submission['problem_id'],
                customTestcase
            )
        else:
            results = run_code_in_docker(
                submission['code'],
                submission['language'],
                submission['submission_id'],
                test_case_paths,
                expected_output_paths,
                customTestcase,
                submission['event']
            )

        submission['status'] = results['status']
        submission['message'] = results['message']
        submission['results'] = results.get('results', '') if mode == 'run' else ''

        return submission
    except Exception as e:
        print(f"Error executing the task: {e}")
        return None


@shared_task
def send_result_to_webhook(result):
    try:
        print(WEB_HOOK_URL)
        response = httpx.post(WEB_HOOK_URL, json=result)
        response.raise_for_status()
        print(f"Result sent to webhook: {result}")
    except httpx.HTTPError as e:
        print(f"Error sending result to webhook: {e}")
    except Exception as e:
        print(f"DONT KNOW WHAT ERROR: {e}")


@app.task
def process_queue(queue_name = SUBMIT_QUEUE):
    try:
        item = redis_client.brpop(queue_name, timeout=1)
        
        if item is None:
            print(f"Queue {queue_name} is empty, waiting for new submissions...")
            return

        _, value = item
        submission = json.loads(value)

        # Decode code
        decoded_bytes = base64.b64decode(submission['code'])
        submission['code'] = decoded_bytes.decode('utf-8')

        if submission['customTestcase'] != "":
            # Decode Testcase
            decoded_bytes = base64.b64decode(submission['customTestcase'])
            submission['customTestcase'] = decoded_bytes.decode('utf-8')

        mode = 'submit' if queue_name == 'submitQueue' else 'run'


        result = execute_program(submission, mode=mode)

        # print(f"Program executed successfully with result : {result}")
        
        if result:
            submission_result = {
                "submission_id": result['submission_id'],
                "problem_id": result['problem_id'],
                "user_id": result['user_id'],
                "results": result['results'],
                "message": result['message'],
                "status": result['status']
            }
            
            send_result_to_webhook(submission_result)
        else:
            print("Error sending execution result to primary backend via webhook")
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
    except Exception as e:
        print(f"Error in process_queue: {e}")

app.conf.beat_schedule = {
    'process-run-queue': {
        'task': 'tasks.process_queue',
        'schedule': timedelta(seconds=1),
        'args': (RUN_QUEUE,)
    },
    'process-submit-queue': {
        'task': 'tasks.process_queue',
        'schedule': timedelta(seconds=1),
        'args': ('submitQueue',)
    }
}

if __name__ == "__main__":
    app.start()