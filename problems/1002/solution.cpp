#include <bits/stdc++.h>
using namespace std;

bool isPrime(int n) {
    if (n <= 1)
        return false;
 
    // Check from 2 to n-1
    for (int i = 2; i <= n / 2; i++)
        if (n % i == 0)
            return false;
 
    return true;
}

int main() {
	int t;
	cin >> t;
	while(t--) {
		int n;
		cin >> n;
		vector<int> inpq;
		int temp;
		for(int i = 0; i < n; i++) {
			cin >> temp;
			inpq.push_back(temp);
		}
		
		vector<int> prime;
		vector<int> compo;
		for(int i = 0; i < n; i++) {
			if(isPrime(inpq[i])) {
				prime.push_back(inpq[i]);
			}
			else {
				compo.push_back(inpq[i]);
			}
		}
		vector<int> vec;
		vec.push_back(0);
		vec.push_back(0);

		int count = n;
		int j = 2;
		while(count) {
			if(isPrime(j)) {
				if(!prime.empty()) {
					vec.push_back(prime[0]);
					prime.erase(prime.begin());
					count--;
				}
				else {
					vec.push_back(0);
				}
			}
			else {
				if(!compo.empty()) {
					vec.push_back(compo[0]);
					compo.erase(compo.begin());
					count--;
				}
				else {
					vec.push_back(0);
				}
			}
			j++;
		}

		for(int i = 0; i < vec.size(); i++) {
			cout << vec[i] << " ";
		}
		cout << endl;
	}
}