// server.js - Электронный журнал для Vercel + Supabase
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);

// PostgreSQL connection pool для Supabase
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to PostgreSQL:', err);
  } else {
    console.log('✅ Connected to PostgreSQL database');
    release();
  }
});

// Initialize tables
async function initializeDatabase() {
  try {
    // Таблица студентов
    await pool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        group_name TEXT NOT NULL,
        course INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица посещаемости (почасовой учет)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        hour INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, date, hour),
        FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
      )
    `);

    // Таблица пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица для общих записей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS entries (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        date TEXT,
        note TEXT,
        updatedAt TEXT
      )
    `);

    // Создаем индексы для улучшения производительности
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_student_date_hour ON attendance(student_id, date, hour)`);

    console.log('✅ Database tables initialized successfully');
    
    // Создаем тестового пользователя если нет пользователей
    const usersResult = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(usersResult.rows[0].count) === 0) {
      await pool.query(
        'INSERT INTO users (username, password, role, name) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8), ($9, $10, $11, $12)',
        [
          'admin', 'admin123', 'admin', 'Администратор системы',
          'dekan', 'dekan123', 'dekan', 'Декан факультета', 
          'dezhur', 'dezhur123', 'dezhur', 'Дежурный преподаватель'
        ]
      );
      console.log('✅ Default users created');
    }
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
}

initializeDatabase();

// ===== API ROUTES =====

// API для аутентификации
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role
        }
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Неверные учетные данные'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для студентов
app.get('/api/students', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM students ORDER BY name ASC');
    
    const students = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      group: row.group_name,
      course: row.course,
      created_at: row.created_at
    }));
    
    res.json(students);
  } catch (error) {
    console.error('Error getting students:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const { name, group, course } = req.body;
    console.log('Adding student:', { name, group, course });
    
    if (!name || !group || course === undefined) {
      return res.status(400).json({ error: 'Missing required fields: name, group, course' });
    }

    const result = await pool.query(
      'INSERT INTO students (name, group_name, course) VALUES ($1, $2, $3) RETURNING *',
      [name, group, course]
    );
    
    const inserted = result.rows[0];
    const studentForClient = {
      id: inserted.id,
      name: inserted.name,
      group: inserted.group_name,
      course: inserted.course
    };
    
    res.json(studentForClient);
  } catch (error) {
    console.error('Error adding student:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log('Deleting student:', id);
    
    // Проверяем существование студента
    const studentResult = await pool.query('SELECT * FROM students WHERE id = $1', [id]);
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Удаляем связанные записи посещаемости и студента в транзакции
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM attendance WHERE student_id = $1', [id]);
      await client.query('DELETE FROM students WHERE id = $1', [id]);
      await client.query('COMMIT');
      
      res.json({ deletedId: id, message: 'Student deleted successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для посещаемости (почасовой учет)
app.get('/api/attendance', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT student_id, date, hour, status 
      FROM attendance 
      ORDER BY date DESC, student_id, hour
    `);
    
    // Преобразуем в формат для фронтенда
    const attendanceData = {
      daily: {},
      hourly: {}
    };
    
    result.rows.forEach(row => {
      // Для почасового учета
      if (!attendanceData.hourly[row.date]) {
        attendanceData.hourly[row.date] = {};
      }
      if (!attendanceData.hourly[row.date][row.student_id]) {
        attendanceData.hourly[row.date][row.student_id] = {};
      }
      
      attendanceData.hourly[row.date][row.student_id][row.hour] = row.status;
      
      // Для daily определяем статус по большинству часов
      const hours = Object.values(attendanceData.hourly[row.date][row.student_id]);
      const presentCount = hours.filter(s => s === 'present').length;
      const absentCount = hours.filter(s => s === 'absent').length;
      
      if (!attendanceData.daily[row.date]) {
        attendanceData.daily[row.date] = {};
      }
      
      if (presentCount > absentCount) {
        attendanceData.daily[row.date][row.student_id] = 'present';
      } else if (absentCount > presentCount) {
        attendanceData.daily[row.date][row.student_id] = 'absent';
      } else if (presentCount > 0 || absentCount > 0) {
        attendanceData.daily[row.date][row.student_id] = 'mixed';
      }
    });
    
    res.json(attendanceData);
  } catch (error) {
    console.error('Error getting attendance:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const { studentId, date, status, hour = null } = req.body;
    console.log('Saving attendance:', { studentId, date, status, hour });
    
    if (!studentId || !date || !status) {
      return res.status(400).json({ error: 'Missing required fields: studentId, date, status' });
    }
    
    // Проверяем существование студента
    const studentResult = await pool.query('SELECT * FROM students WHERE id = $1', [studentId]);
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    if (hour !== null && hour !== undefined) {
      // Почасовой учет
      if (status === 'unknown') {
        // Удаляем запись если статус unknown
        await pool.query(
          'DELETE FROM attendance WHERE student_id = $1 AND date = $2 AND hour = $3',
          [studentId, date, hour]
        );
      } else {
        // Вставляем или обновляем запись (ON CONFLICT для PostgreSQL)
        await pool.query(
          `INSERT INTO attendance (student_id, date, hour, status) 
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (student_id, date, hour) 
           DO UPDATE SET status = $4`,
          [studentId, date, hour, status]
        );
      }
    } else {
      // Ежедневный учет (для обратной совместимости)
      // Удаляем все часовые записи за этот день
      await pool.query(
        'DELETE FROM attendance WHERE student_id = $1 AND date = $2',
        [studentId, date]
      );
      
      if (status !== 'unknown') {
        // Создаем записи для всех часов
        for (let h = 1; h <= 5; h++) {
          await pool.query(
            'INSERT INTO attendance (student_id, date, hour, status) VALUES ($1, $2, $3, $4)',
            [studentId, date, h, status]
          );
        }
      }
    }
    
    const attendanceData = {
      studentId: parseInt(studentId),
      date: date,
      status: status,
      hour: hour
    };
    
    res.json({ success: true, ...attendanceData });
    
  } catch (error) {
    console.error('Error saving attendance:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение посещаемости за период
app.get('/api/attendance/period', async (req, res) => {
  try {
    const { startDate, endDate, group } = req.query;
    
    let query = `
      SELECT s.id as student_id, s.name, s.group_name, a.date, a.hour, a.status
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id 
        AND a.date BETWEEN $1 AND $2
    `;
    
    const params = [startDate, endDate];
    let paramCount = 2;
    
    if (group) {
      paramCount++;
      query += ` WHERE s.group_name = $${paramCount}`;
      params.push(group);
    }
    
    query += ' ORDER BY s.name, a.date, a.hour';
    
    const result = await pool.query(query, params);
    
    // Группируем данные по студентам и датам
    const studentsData = {};
    
    result.rows.forEach(row => {
      if (!studentsData[row.student_id]) {
        studentsData[row.student_id] = {
          id: row.student_id,
          name: row.name,
          group: row.group_name,
          attendance: {}
        };
      }
      
      if (row.date) {
        if (!studentsData[row.student_id].attendance[row.date]) {
          studentsData[row.student_id].attendance[row.date] = {};
        }
        
        if (row.hour) {
          studentsData[row.student_id].attendance[row.date][row.hour] = row.status;
        }
      }
    });
    
    res.json(Object.values(studentsData));
  } catch (error) {
    console.error('Error getting period attendance:', error);
    res.status(500).json({ error: error.message });
  }
});

// Массовое добавление студентов
app.post('/api/students/batch', async (req, res) => {
  try {
    const { students: studentsList } = req.body;
    console.log('Batch adding students:', studentsList.length);
    
    if (!studentsList || !Array.isArray(studentsList)) {
      return res.status(400).json({ error: 'Missing or invalid students list' });
    }
    
    const results = [];
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const studentData of studentsList) {
        const { name, group, course } = studentData;
        
        try {
          const result = await client.query(
            'INSERT INTO students (name, group_name, course) VALUES ($1, $2, $3) RETURNING *',
            [name, group, course]
          );
          
          const inserted = result.rows[0];
          const studentForClient = {
            id: inserted.id,
            name: inserted.name,
            group: inserted.group_name,
            course: inserted.course
          };
          
          results.push(studentForClient);
          
        } catch (error) {
          console.error(`Error adding student ${name}:`, error);
          results.push({ error: error.message, student: studentData });
        }
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        added: results.filter(r => !r.error).length,
        errors: results.filter(r => r.error).length,
        results 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error in batch add:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение статистики
app.get('/api/stats/daily/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    const result = await pool.query(`
      SELECT 
        s.group_name as group,
        COUNT(DISTINCT s.id) as total_students,
        COUNT(DISTINCT CASE WHEN a.status = 'present' THEN a.student_id END) as present,
        COUNT(DISTINCT CASE WHEN a.status = 'absent' THEN a.student_id END) as absent
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id AND a.date = $1
      GROUP BY s.group_name
    `, [date]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting daily stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Старые API для обратной совместимости
app.get('/api/entries', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM entries ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/entries', async (req, res) => {
  try {
    const { name, date, note } = req.body;
    const updatedAt = new Date().toISOString();
    const result = await pool.query(
      'INSERT INTO entries (name, date, note, updatedAt) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, date, note, updatedAt]
    );
    const inserted = result.rows[0];
    res.json(inserted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/entries/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, date, note } = req.body;
    const updatedAt = new Date().toISOString();
    const result = await pool.query(
      'UPDATE entries SET name=$1, date=$2, note=$3, updatedAt=$4 WHERE id=$5 RETURNING *',
      [name, date, note, updatedAt, id]
    );
    const updated = result.rows[0];
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/entries/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await pool.query('SELECT * FROM entries WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    
    await pool.query('DELETE FROM entries WHERE id = $1', [id]);
    res.json({ deletedId: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Проверяем соединение с базой данных
    await pool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'Connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'Error', 
      timestamp: new Date().toISOString(),
      database: 'Disconnected',
      error: error.message 
    });
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('🚀 Server listening on port', PORT);
  console.log('📊 Database: PostgreSQL (Supabase)');
  console.log('🔗 Health check: /api/health');
  console.log('⏰ Почасовой учет посещаемости активирован');
});

module.exports = app;
