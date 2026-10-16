You can use your existing account to obtain a bearer token for API Explorer.

1. For the embedded Apollo Explorer, add its origin to ALLOWED_ORIGINS in your backend .env for local development, then restart the backend:

ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4000,http://localhost:4000,https://sandbox.embed.apollographql.com


2. Open API Explorer. Remove any old Authorization header and run:

mutation SignIn($email: String!, $password: String!) {
  signIn(email: $email, password: $password) {
    token
    expiresAt
    user { id name role }
  }
}

Enter your account credentials in Variables:
{
  "email": "your-account@example.com",
  "password": "your-password"
}

3. Copy the returned token. Under Headers, add:
Header	Value
Authorization	Bearer YOUR_TOKEN_HERE


Use shared headers if you want authentication applied across Explorer tabs. Keep Explorer’s cookie/“include cookies” option disabled when using this bearer-token approach.

4. Test an authenticated query:
query {
  me { id name email role }
  employees {
    id
    name
    team { name }
  }
}
Admin-only mutations require signing in with your admin account. Tokens expire after eight hours; run signIn again when needed. Treat the token like a password and avoid sharing or committing it.