#!/usr/bin/env pwsh
# PowerShell script: create test employee, generate JWT, create order, add addon
$jwtSecret = 'testjwtsecret'
$node = @"
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../src/database/db');
const util = require('util');
const get = (sql, params=[])=> new Promise((res,rej)=> db.get(sql, params, (e,r)=> e?rej(e):res(r)));
const run = (sql, params=[])=> new Promise((res,rej)=> db.run(sql, params, function(err){ if(err) rej(err); else res(this); }));
(async ()=>{
  try{
    const empId = 'EMP_TEST';
    const name = 'Tester';
    // insert employee if not exists
    const existing = await get('SELECT id FROM employees WHERE employee_id = ?', [empId]);
    if(!existing){
      await run(`INSERT INTO employees (employee_id, name, department) VALUES (?, ?, ?);`, [empId, name, 'Front']);
      console.log('Inserted test employee');
    } else {
      console.log('Test employee exists');
    }
    const sessionId = crypto.randomBytes(16).toString('hex');
    const sessionPayload = { sessionId, employee_id: empId, expiresAt: Date.now() + 7*24*60*60*1000 };
    await run("INSERT INTO restaurant_settings (key, value) VALUES ('payment_counter_session', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify(sessionPayload)]);
    const token = jwt.sign({ role: 'payment_counter', id: empId, name, sessionId }, process.env.JWT_SECRET || '