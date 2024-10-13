#include <bits/stdc++.h>
using namespace std;
#define int long long
typedef long long ll;

bool isPrime(int n){
	if(n==1) return false;
	for(int i=2;i*i<=n;i++){
		if(n%i==0)
			return false;
	}
	return true;
}

bool winner(int n, int k) {

    if (n == 0) return false;
    if (n <= 2) return true;

    vector<bool> dp(n+1, false);
    dp[1] = dp[2] = true;

    for (int i = 3; i <= n; i++) {
        dp[i] = !dp[i-1] || (i-k >= 0 && !dp[i-k]) || (i-2 >= 0 && !dp[i-2]);
    }

    return dp[n];
}

void duck(){
     int n;
       cin>>n;
       int m=2*n;
       int arr[m];
       for(int j=0;j<m;j++){
           cin>>arr[j];
       }

       sort(arr,arr+m);


       cout<<abs(arr[n-1]-arr[n])<<endl;
}


// }
signed main()
{
    long long test;
    cin>>test;
    while(test--){
         duck();
       // isPrime()
    }
    return 0;
}