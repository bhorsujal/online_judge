import os
import json
import subprocess
import shutil
import httpx
from celery import Celery, shared_task
from celery.schedules import timedelta
from redis import Redis
from dotenv import load_dotenv
import base64

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

def run_code_in_docker(code, language, submission_id, problem_id, test_case_paths, expected_output_paths):
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

        filename = f"submission_{submission_id}{extension}"
        work_dir = os.path.join(os.getcwd(), "..", "problems", f"submission_{submission_id}")
        output_dir = os.path.join(work_dir, "outputs")
        input_dir = os.path.join(work_dir, "inputs")
        expected_output_dir = os.path.join(work_dir, "exp_outputs")

        os.makedirs(work_dir, exist_ok=True)
        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(expected_output_dir, exist_ok=True)

        # Write the code to file
        code_path = os.path.join(work_dir, filename)
        with open(code_path, 'w') as f:
            f.write(code)

        # Copy test cases and expected outputs
        for i, (test_case, expected_output) in enumerate(zip(test_case_paths, expected_output_paths)):
            shutil.copy(test_case, os.path.join(input_dir, f'in{i}.txt'))
            shutil.copy(expected_output, os.path.join(expected_output_dir, f'out{i}.txt'))

        # Compilation step if needed
        if 'compile_cmd' in config:
            compile_cmd = config['compile_cmd'].format(
                filename=filename,
                exec_name=f"{filename}_exec",
                classname=filename[:-5]  # For Java, filename is Main.java
            )
            compile_cmd_list = ["docker", "run", "--rm", "-v", f"{work_dir}:/app", "-w", "/app", image] + compile_cmd.split()
            compile_result = subprocess.run(
                compile_cmd_list,
                capture_output=True, text=True
            )
            if compile_result.returncode != 0:
                error_message = compile_result.stderr
                return {
                    "status": "compilation_error",
                    "message": "Compilation failed.",
                    "results": error_message
                }

        # Run the code for each test case
        for i in range(len(test_case_paths)):
            input_file = f"inputs/in{i}.txt"
            output_file = f"outputs/output_{i}.txt"
            expected_output_file = f"exp_outputs/out{i}.txt"

            # Prepare the run command
            run_cmd = config['run_cmd'].format(
                filename=filename,
                exec_name=f"{filename}_exec",
                classname=filename[:-5]
            )
            docker_run_cmd = [
                "docker", "run", "--rm", "--memory=256m", "--cpus=1",
                "-v", f"{work_dir}:/app", "-w", "/app", image,
                "sh", "-c", f"timeout {timeout}s {run_cmd} < {input_file} > {output_file}"
            ]

            run_result = subprocess.run(
                docker_run_cmd,
                capture_output=True, text=True
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
                    "message": f"Runtime error occurred on testcase {i}.",
                    "results": error_message
                }

            # Compare output
            with open(os.path.join(work_dir, output_file), "r") as f_output, \
                 open(os.path.join(work_dir, expected_output_file), "r") as f_expected:
                if f_output.read().strip() != f_expected.read().strip():
                    return {"status": "wrong_answer", "message": f"Failed on testcase {i}."}

        return results
    except Exception as e:
        print("Error in running in docker", e)
        return {"status": "pending", "message": "Unexpected error occurred", "results": str(e)}
    finally:
        if os.path.exists(work_dir):
            shutil.rmtree(work_dir)

@app.task
def execute_program(submission, mode='submit'):
    try:
        num_test_cases = 6 if mode == 'submit' else 1
        test_case_paths = [f"../problems/{submission['problem_id']}/in{i}.txt" for i in range(num_test_cases)]
        expected_output_paths = [f"../problems/{submission['problem_id']}/out{i}.txt" for i in range(num_test_cases)]

        results = run_code_in_docker(
            submission['code'],
            submission['language'],
            submission['submission_id'],
            submission['problem_id'],
            test_case_paths,
            expected_output_paths
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
        response = httpx.post(WEB_HOOK_URL, json=result)
        response.raise_for_status()
        print(f"Result sent to webhook: {result}")
    except httpx.HTTPError as e:
        print(f"Error sending result to webhook: {e}")
    except Exception as e:
        print(f"Unknown error: {e}")

@app.task
def process_queue(queue_name=SUBMIT_QUEUE):
    try:
        item = redis_client.brpop(queue_name, timeout=1)
        
        if item is None:
            print(f"Queue {queue_name} is empty, waiting for new submissions...")
            return

        _, value = item
        submission = json.loads(value)

        # Decode from base64
        decoded_bytes = base64.b64decode(submission['code'])
        submission['code'] = decoded_bytes.decode('utf-8')

        mode = 'submit' if queue_name == 'submitQueue' else 'run'
        result = execute_program(submission, mode=mode)

        if result:
            submission_result = {
                "submission_id": result['submission_id'],
                "problem_id": result['problem_id'],
                "user_id": result['user_id'],
                "results": result.get('results', ''),
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
