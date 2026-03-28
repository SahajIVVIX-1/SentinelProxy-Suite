#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const readline = require('readline');
const security = require('./security');

const DATA_DIR = path.join(__dirname, '..', 'data');
const usersDbPath = path.join(DATA_DIR, 'users.db');

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(query, (answer) => {
        rl.close();
        resolve(answer.trim());
    }));
}

function askHidden(query) {
    return new Promise((resolve) => {
        const stdin = process.stdin;
        const stdout = process.stdout;
        let value = '';

        stdout.write(query);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        function onData(char) {
            if (char === '\u0003') {
                stdout.write('\n');
                process.exit(1);
            }
            if (char === '\r' || char === '\n') {
                stdout.write('\n');
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', onData);
                resolve(value.trim());
                return;
            }
            if (char === '\u007f') {
                value = value.slice(0, -1);
                return;
            }
            value += char;
        }

        stdin.on('data', onData);
    });
}

async function ensureUsersTable(db) {
    return new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function main() {
    const username = await askQuestion('Admin username: ');
    if (!username) {
        console.error('Username is required.');
        process.exit(1);
    }

    const password = await askHidden('Admin password: ');
    if (!password) {
        console.error('Password is required.');
        process.exit(1);
    }

    const hashed = await security.hashPassword(password);

    const db = new sqlite3.Database(usersDbPath);
    try {
        await ensureUsersTable(db);
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET password = excluded.password, role = excluded.role',
                [username, hashed, 'admin'],
                (err) => (err ? reject(err) : resolve())
            );
        });
        console.log('Admin user created/updated successfully.');
    } catch (err) {
        console.error('Failed to create admin user:', err.message);
        process.exit(1);
    } finally {
        db.close();
    }
}

main();
