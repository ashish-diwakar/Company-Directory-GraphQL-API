import 'dotenv/config';
import jwt from 'jsonwebtoken';

const role = process.argv[2] ?? 'ADMIN';
if (role !== 'ADMIN' && role !== 'EMPLOYEE') throw new Error('Role must be ADMIN or EMPLOYEE.');
if (!process.env.JWT_SECRET) throw new Error('Set JWT_SECRET in .env before generating a token.');
console.log(jwt.sign({ email: `${role.toLowerCase()}@example.com`, role }, process.env.JWT_SECRET, {
  subject: `demo-${role.toLowerCase()}`, expiresIn: '1h', algorithm: 'HS256',
}));
