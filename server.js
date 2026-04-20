// // server.js - Электронный журнал для Vercel + Neon PostgreSQL
// const express = require('express');
// const bodyParser = require('body-parser');
// const cors = require('cors');
// const { Pool } = require('pg');
// const path = require('path');
// const http = require('http');
// const socketIo = require('socket.io');

// const app = express();
// const server = http.createServer(app);
// const io = socketIo(server, {
//   cors: {
//     origin: ["https://electronic-journal-hazel.vercel.app", "http://localhost:3000"],
//     methods: ["GET", "POST"],
//     credentials: true
//   }
// });

// // Настройка PostgreSQL для Neon
// const pool = new Pool({
//   connectionString: process.env.POSTGRES_URL,
//   ssl: {
//     rejectUnauthorized: false
//   }
// });

// // Middleware
// app.use(cors());
// app.use(bodyParser.json({ limit: '50mb' }));
// app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
// app.use(express.static(path.join(__dirname, 'public')));

// // Флаг для отслеживания импорта студентов
// let studentsImported = false;

// // Инициализация базы данных
// async function initializeDatabase() {
//   try {
//     console.log('🔄 Проверка подключения к базе данных...');

//     // Проверяем подключение
//     await pool.query('SELECT NOW()');
//     console.log('✅ Подключение к базе данных успешно');

//     // Проверяем существование таблиц
//     const tables = ['students', 'attendance', 'users', 'saved_days', 'absence_reasons', 'import_status'];
    
//     for (const table of tables) {
//       const tableExists = await pool.query(`
//         SELECT EXISTS (
//           SELECT FROM information_schema.tables 
//           WHERE table_schema = 'public' 
//           AND table_name = $1
//         )
//       `, [table]);
      
//       if (!tableExists.rows[0].exists) {
//         console.log(`❌ Таблица ${table} не найдена. Выполните SQL скрипт для создания структуры базы данных.`);
//         return false;
//       }
//     }

//     console.log('✅ Все таблицы существуют');

//     // Проверяем статус импорта
//     const importStatus = await pool.query('SELECT * FROM import_status ORDER BY id DESC LIMIT 1');
//     if (importStatus.rows.length > 0) {
//       studentsImported = importStatus.rows[0].imported;
//       console.log(`📊 Статус импорта студентов: ${studentsImported ? 'ВЫПОЛНЕН' : 'НЕ ВЫПОЛНЕН'}`);
//     } else {
//       console.log('ℹ️  Статус импорта не найден');
//     }

//     // Проверяем наличие пользователей
//     const usersResult = await pool.query('SELECT COUNT(*) FROM users');
//     if (parseInt(usersResult.rows[0].count) === 0) {
//       console.log('👥 Создаем тестовых пользователей...');
//       await pool.query(
//         `INSERT INTO users (username, password, role, name) VALUES 
//          ($1, $2, $3, $4), 
//          ($5, $6, $7, $8), 
//          ($9, $10, $11, $12)`,
//         [
//           'admin', 'admin123', 'admin', 'Администратор системы',
//           'dekan', 'dekan123', 'dekan', 'Декан факультета', 
//           'dezhur', '123', 'dezhur', 'Дежурный преподаватель'
//         ]
//       );
//       console.log('✅ Тестовые пользователи созданы');
//     } else {
//       console.log(`✅ Пользователи уже существуют: ${usersResult.rows[0].count} записей`);
//     }

//     // Проверяем наличие студентов
//     const studentsResult = await pool.query('SELECT COUNT(*) FROM students');
//     const studentCount = parseInt(studentsResult.rows[0].count);
    
//     if (studentCount === 0 && !studentsImported) {
//       console.log('👨‍🎓 Создаем тестовых студентов...');
//       const testStudents = [
//         { name: 'Алишер Усманов', group: '1-260101-00-a', course: 1 },
//         { name: 'Фарход Рахимов', group: '1-260101-00-a', course: 1 },
//         { name: 'Шахзод Усупов', group: '1-260101-00-a', course: 1 },
//         { name: 'Галина Толочко', group: '1-250107', course: 1 },
//         { name: 'Мирослав Ульяненко', group: '1-250107', course: 1 }
//       ];

//       for (const student of testStudents) {
//         await pool.query(
//           'INSERT INTO students (name, group_name, course) VALUES ($1, $2, $3)',
//           [student.name, student.group, student.course]
//         );
//       }
//       console.log('✅ Тестовые студенты созданы');
//     } else {
//       console.log(`✅ Студенты уже существуют: ${studentCount} записей`);
//     }

//     return true;

//   } catch (error) {
//     console.error('❌ Ошибка инициализации базы данных:', error);
//     return false;
//   }
// }

// // ===== API ROUTES =====

// // Аутентификация
// app.post('/api/login', async (req, res) => {
//   try {
//     const { username, password } = req.body;
    
//     if (!username || !password) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Логин и пароль обязательны' 
//       });
//     }

//     const result = await pool.query(
//       'SELECT id, username, name, role FROM users WHERE username = $1 AND password = $2',
//       [username, password]
//     );
    
//     if (result.rows.length > 0) {
//       const user = result.rows[0];
//       res.json({
//         success: true,
//         user: {
//           id: user.id,
//           username: user.username,
//           name: user.name,
//           role: user.role
//         }
//       });
//     } else {
//       res.status(401).json({
//         success: false,
//         error: 'Неверные учетные данные'
//       });
//     }
//   } catch (error) {
//     console.error('Login error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Внутренняя ошибка сервера' 
//     });
//   }
// });

// // Получение списка студентов
// app.get('/api/students', async (req, res) => {
//   try {
//     const result = await pool.query(`
//       SELECT id, name, group_name as group, course, created_at 
//       FROM students 
//       ORDER BY group_name, name ASC
//     `);
    
//     res.json(result.rows);
//   } catch (error) {
//     console.error('Error getting students:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Добавление студента
// app.post('/api/students', async (req, res) => {
//   try {
//     const { name, group, course } = req.body;
    
//     if (!name || !group || course === undefined) {
//       return res.status(400).json({ 
//         error: 'Все поля обязательны: name, group, course' 
//       });
//     }

//     const result = await pool.query(
//       `INSERT INTO students (name, group_name, course) 
//        VALUES ($1, $2, $3) 
//        RETURNING id, name, group_name as group, course`,
//       [name, group, parseInt(course)]
//     );
    
//     const newStudent = result.rows[0];
//     res.json(newStudent);
    
//     // Уведомляем всех клиентов через WebSocket
//     io.emit('student_added', newStudent);
    
//   } catch (error) {
//     console.error('Error adding student:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Удаление студента
// app.delete('/api/students/:id', async (req, res) => {
//   try {
//     const id = parseInt(req.params.id);
    
//     // Проверяем существование студента
//     const studentResult = await pool.query('SELECT * FROM students WHERE id = $1', [id]);
//     if (studentResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Студент не найден' });
//     }
    
//     const client = await pool.connect();
//     try {
//       await client.query('BEGIN');
      
//       // Удаляем связанные записи посещаемости
//       await client.query('DELETE FROM attendance WHERE student_id = $1', [id]);
//       // Удаляем связанные записи причин пропусков
//       await client.query('DELETE FROM absence_reasons WHERE student_id = $1', [id]);
//       // Удаляем студента
//       await client.query('DELETE FROM students WHERE id = $1', [id]);
      
//       await client.query('COMMIT');
      
//       res.json({ 
//         success: true, 
//         deletedId: id, 
//         message: 'Студент успешно удален' 
//       });
      
//       // Уведомляем всех клиентов
//       io.emit('student_deleted', id);
      
//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   } catch (error) {
//     console.error('Error deleting student:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Массовое добавление студентов
// app.post('/api/students/batch', async (req, res) => {
//   try {
//     const { students: studentsList } = req.body;
    
//     if (!studentsList || !Array.isArray(studentsList) || studentsList.length === 0) {
//       return res.status(400).json({ 
//         error: 'Список студентов обязателен и не должен быть пустым' 
//       });
//     }

//     if (studentsList.length > 33) {
//       return res.status(400).json({ 
//         error: 'Максимальное количество студентов для массового добавления: 33' 
//       });
//     }

//     const results = [];
//     const client = await pool.connect();
    
//     try {
//       await client.query('BEGIN');
      
//       for (const studentData of studentsList) {
//         const { name, group, course } = studentData;
        
//         if (!name || !group || course === undefined) {
//           results.push({ 
//             error: 'Отсутствуют обязательные поля', 
//             student: studentData 
//           });
//           continue;
//         }

//         try {
//           const result = await client.query(
//             `INSERT INTO students (name, group_name, course) 
//              VALUES ($1, $2, $3) 
//              RETURNING id, name, group_name as group, course`,
//             [name.trim(), group, parseInt(course)]
//           );
          
//           results.push(result.rows[0]);
          
//         } catch (error) {
//           console.error(`Error adding student ${name}:`, error);
//           results.push({ 
//             error: error.message, 
//             student: studentData 
//           });
//         }
//       }
      
//       await client.query('COMMIT');
      
//       const successful = results.filter(r => !r.error);
      
//       res.json({ 
//         success: true, 
//         added: successful.length,
//         errors: results.length - successful.length,
//         results 
//       });
      
//       // Уведомляем о новых студентах
//       successful.forEach(student => {
//         io.emit('student_added', student);
//       });
      
//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
    
//   } catch (error) {
//     console.error('Error in batch add:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Получение данных о посещаемости
// app.get('/api/attendance', async (req, res) => {
//   try {
//     const result = await pool.query(`
//       SELECT student_id, date, hour, status 
//       FROM attendance 
//       ORDER BY date DESC, student_id, hour
//     `);
    
//     // Преобразуем в формат для фронтенда
//     const attendanceData = {
//       daily: {},
//       hourly: {}
//     };
    
//     result.rows.forEach(row => {
//       const { student_id, date, hour, status } = row;
      
//       // Почасовой учет
//       if (!attendanceData.hourly[date]) {
//         attendanceData.hourly[date] = {};
//       }
//       if (!attendanceData.hourly[date][student_id]) {
//         attendanceData.hourly[date][student_id] = {};
//       }
      
//       attendanceData.hourly[date][student_id][hour] = status;
      
//       // Ежедневный учет (определяем по большинству часов)
//       const hours = Object.values(attendanceData.hourly[date][student_id]);
//       const presentCount = hours.filter(s => s === 'present').length;
//       const absentCount = hours.filter(s => s === 'absent').length;
      
//       if (!attendanceData.daily[date]) {
//         attendanceData.daily[date] = {};
//       }
      
//       if (presentCount > absentCount) {
//         attendanceData.daily[date][student_id] = 'present';
//       } else if (absentCount > presentCount) {
//         attendanceData.daily[date][student_id] = 'absent';
//       } else if (presentCount > 0 || absentCount > 0) {
//         attendanceData.daily[date][student_id] = 'mixed';
//       }
//     });
    
//     res.json(attendanceData);
//   } catch (error) {
//     console.error('Error getting attendance:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Сохранение посещаемости
// app.post('/api/attendance', async (req, res) => {
//   try {
//     const { studentId, date, status, hour = null } = req.body;
    
//     if (!studentId || !date || !status) {
//       return res.status(400).json({ 
//         error: 'Обязательные поля: studentId, date, status' 
//       });
//     }
    
//     // Проверяем существование студента
//     const studentResult = await pool.query('SELECT * FROM students WHERE id = $1', [studentId]);
//     if (studentResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Студент не найден' });
//     }
    
//     // Проверяем, не заблокирован ли день для редактирования
//     const group = studentResult.rows[0].group_name;
//     const savedDayResult = await pool.query(
//       'SELECT * FROM saved_days WHERE date = $1 AND group_name = $2',
//       [date, group]
//     );
    
//     if (savedDayResult.rows.length > 0) {
//       return res.status(423).json({ 
//         error: 'Посещаемость за этот день уже сохранена и заблокирована для редактирования' 
//       });
//     }
    
//     if (hour !== null && hour !== undefined) {
//       // Почасовой учет
//       if (status === 'unknown') {
//         // Удаляем запись если статус unknown
//         await pool.query(
//           'DELETE FROM attendance WHERE student_id = $1 AND date = $2 AND hour = $3',
//           [studentId, date, hour]
//         );
//       } else {
//         // Вставляем или обновляем запись
//         await pool.query(
//           `INSERT INTO attendance (student_id, date, hour, status) 
//            VALUES ($1, $2, $3, $4)
//            ON CONFLICT (student_id, date, hour) 
//            DO UPDATE SET status = $4, created_at = CURRENT_TIMESTAMP`,
//           [studentId, date, hour, status]
//         );
//       }
//     } else {
//       // Ежедневный учет (для обратной совместимости)
//       await pool.query(
//         'DELETE FROM attendance WHERE student_id = $1 AND date = $2',
//         [studentId, date]
//       );
      
//       if (status !== 'unknown') {
//         for (let h = 1; h <= 5; h++) {
//           await pool.query(
//             `INSERT INTO attendance (student_id, date, hour, status) 
//              VALUES ($1, $2, $3, $4)`,
//             [studentId, date, h, status]
//           );
//         }
//       }
//     }
    
//     const attendanceData = {
//       studentId: parseInt(studentId),
//       date: date,
//       status: status,
//       hour: hour
//     };
    
//     res.json({ success: true, ...attendanceData });
    
//     // Уведомляем всех клиентов через WebSocket
//     io.emit('attendance_updated', attendanceData);
    
//   } catch (error) {
//     console.error('Error saving attendance:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Сохранение и блокировка дня
// app.post('/api/save-day', async (req, res) => {
//   try {
//     const { date, profession: group_name, savedBy } = req.body;
    
//     if (!date || !group_name) {
//       return res.status(400).json({ 
//         error: 'Обязательные поля: date, profession' 
//       });
//     }
    
//     // Сохраняем информацию о сохраненном дне
//     await pool.query(
//       `INSERT INTO saved_days (date, group_name, saved_by) 
//        VALUES ($1, $2, $3)
//        ON CONFLICT (date, group_name) 
//        DO UPDATE SET saved_by = $3, saved_at = CURRENT_TIMESTAMP`,
//       [date, group_name, savedBy || null]
//     );
    
//     res.json({ 
//       success: true, 
//       message: 'День успешно сохранен и заблокирован',
//       date: date,
//       group: group_name
//     });
    
//     // Уведомляем всех клиентов
//     io.emit('day_saved', { date, profession: group_name });
    
//   } catch (error) {
//     console.error('Error saving day:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Получение информации о сохраненных днях
// app.get('/api/saved-days', async (req, res) => {
//   try {
//     const result = await pool.query(`
//       SELECT date, group_name, saved_at 
//       FROM saved_days 
//       ORDER BY date DESC
//     `);
    
//     const savedDays = {};
//     result.rows.forEach(row => {
//       if (!savedDays[row.date]) {
//         savedDays[row.date] = {};
//       }
//       savedDays[row.date][row.group_name] = true;
//     });
    
//     res.json(savedDays);
//   } catch (error) {
//     console.error('Error getting saved days:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Получение посещаемости за период
// app.get('/api/attendance/period', async (req, res) => {
//   try {
//     const { startDate, endDate, group } = req.query;
    
//     if (!startDate || !endDate) {
//       return res.status(400).json({ 
//         error: 'Обязательные параметры: startDate, endDate' 
//       });
//     }
    
//     let query = `
//       SELECT s.id as student_id, s.name, s.group_name, a.date, a.hour, a.status
//       FROM students s
//       LEFT JOIN attendance a ON s.id = a.student_id 
//         AND a.date BETWEEN $1 AND $2
//     `;
    
//     const params = [startDate, endDate];
    
//     if (group) {
//       query += ` WHERE s.group_name = $3`;
//       params.push(group);
//     }
    
//     query += ' ORDER BY s.name, a.date, a.hour';
    
//     const result = await pool.query(query, params);
    
//     // Группируем данные по студентам и датам
//     const studentsData = {};
    
//     result.rows.forEach(row => {
//       if (!studentsData[row.student_id]) {
//         studentsData[row.student_id] = {
//           id: row.student_id,
//           name: row.name,
//           group: row.group_name,
//           attendance: {}
//         };
//       }
      
//       if (row.date) {
//         if (!studentsData[row.student_id].attendance[row.date]) {
//           studentsData[row.student_id].attendance[row.date] = {};
//         }
        
//         if (row.hour) {
//           studentsData[row.student_id].attendance[row.date][row.hour] = row.status;
//         }
//       }
//     });
    
//     res.json(Object.values(studentsData));
//   } catch (error) {
//     console.error('Error getting period attendance:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Статистика за день
// app.get('/api/stats/daily/:date', async (req, res) => {
//   try {
//     const { date } = req.params;
    
//     const result = await pool.query(`
//       SELECT 
//         s.group_name as group,
//         COUNT(DISTINCT s.id) as total_students,
//         COUNT(DISTINCT CASE WHEN a.status = 'present' THEN a.student_id END) as present,
//         COUNT(DISTINCT CASE WHEN a.status = 'absent' THEN a.student_id END) as absent
//       FROM students s
//       LEFT JOIN attendance a ON s.id = a.student_id AND a.date = $1
//       GROUP BY s.group_name
//     `, [date]);
    
//     res.json(result.rows);
//   } catch (error) {
//     console.error('Error getting daily stats:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Получение причин пропусков
// app.get('/api/absence-reasons', async (req, res) => {
//   try {
//     const result = await pool.query(`
//       SELECT student_id, date, hour, reason 
//       FROM absence_reasons 
//       ORDER BY date DESC, student_id, hour
//     `);
    
//     // Преобразуем в формат для фронтенда
//     const reasonsData = {};
    
//     result.rows.forEach(row => {
//       const { student_id, date, hour, reason } = row;
      
//       if (!reasonsData[date]) {
//         reasonsData[date] = {};
//       }
//       if (!reasonsData[date][student_id]) {
//         reasonsData[date][student_id] = {};
//       }
      
//       reasonsData[date][student_id][hour] = reason;
//     });
    
//     res.json(reasonsData);
//   } catch (error) {
//     console.error('Error getting absence reasons:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Сохранение причины пропуска
// app.post('/api/absence-reasons', async (req, res) => {
//   try {
//     const { studentId, date, hour, reason } = req.body;
    
//     if (!studentId || !date || hour === undefined) {
//       return res.status(400).json({ 
//         error: 'Обязательные поля: studentId, date, hour' 
//       });
//     }
    
//     // Проверяем существование студента
//     const studentResult = await pool.query('SELECT * FROM students WHERE id = $1', [studentId]);
//     if (studentResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Студент не найден' });
//     }
    
//     if (reason === null) {
//       // Удаляем запись причины
//       await pool.query(
//         'DELETE FROM absence_reasons WHERE student_id = $1 AND date = $2 AND hour = $3',
//         [studentId, date, hour]
//       );
//     } else {
//       // Вставляем или обновляем запись
//       await pool.query(
//         `INSERT INTO absence_reasons (student_id, date, hour, reason) 
//          VALUES ($1, $2, $3, $4)
//          ON CONFLICT (student_id, date, hour) 
//          DO UPDATE SET reason = $4, created_at = CURRENT_TIMESTAMP`,
//         [studentId, date, hour, reason]
//       );
//     }
    
//     const reasonData = {
//       studentId: parseInt(studentId),
//       date: date,
//       hour: hour,
//       reason: reason
//     };
    
//     res.json({ success: true, ...reasonData });
    
//     // Уведомляем всех клиентов через WebSocket
//     io.emit('absence_reason_updated', reasonData);
    
//   } catch (error) {
//     console.error('Error saving absence reason:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Health check endpoint
// app.get('/api/health', async (req, res) => {
//   try {
//     await pool.query('SELECT 1');
    
//     // Получаем статистику базы данных
//     const studentsCount = await pool.query('SELECT COUNT(*) FROM students');
//     const usersCount = await pool.query('SELECT COUNT(*) FROM users');
//     const attendanceCount = await pool.query('SELECT COUNT(*) FROM attendance');
    
//     res.json({ 
//       status: 'OK', 
//       timestamp: new Date().toISOString(),
//       database: 'Connected',
//       environment: process.env.NODE_ENV || 'development',
//       statistics: {
//         students: parseInt(studentsCount.rows[0].count),
//         users: parseInt(usersCount.rows[0].count),
//         attendance: parseInt(attendanceCount.rows[0].count)
//       },
//       students_imported: studentsImported
//     });
//   } catch (error) {
//     res.status(500).json({ 
//       status: 'Error', 
//       timestamp: new Date().toISOString(),
//       database: 'Disconnected',
//       error: error.message 
//     });
//   }
// });

// // Проверка структуры базы данных
// app.get('/api/db-check', async (req, res) => {
//   try {
//     const tables = ['students', 'attendance', 'users', 'saved_days', 'absence_reasons', 'import_status'];
//     const tableStatus = {};
    
//     for (const table of tables) {
//       const tableExists = await pool.query(`
//         SELECT EXISTS (
//           SELECT FROM information_schema.tables 
//           WHERE table_schema = 'public' 
//           AND table_name = $1
//         )
//       `, [table]);
      
//       tableStatus[table] = tableExists.rows[0].exists;
      
//       if (tableExists.rows[0].exists) {
//         const countResult = await pool.query(`SELECT COUNT(*) FROM ${table}`);
//         tableStatus[`${table}_count`] = parseInt(countResult.rows[0].count);
//       }
//     }
    
//     res.json({
//       success: true,
//       tables: tableStatus,
//       students_imported: studentsImported
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });

// // Serve static files
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// app.get('/login', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// app.get('/main', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'main.html'));
// });

// // WebSocket соединения
// io.on('connection', (socket) => {
//   console.log('🔌 Новое WebSocket соединение:', socket.id);
  
//   socket.on('disconnect', () => {
//     console.log('🔌 WebSocket соединение закрыто:', socket.id);
//   });
// });

// // Error handling middleware
// app.use((err, req, res, next) => {
//   console.error('Unhandled error:', err);
//   res.status(500).json({ error: 'Internal server error' });
// });

// // 404 handler
// app.use((req, res) => {
//   res.status(404).json({ error: 'Endpoint not found' });
// });

// // Запуск сервера
// const PORT = process.env.PORT || 3000;

// async function startServer() {
//   try {
//     console.log('🚀 Запуск сервера...');
//     console.log('📊 Проверка базы данных...');
    
//     const dbInitialized = await initializeDatabase();
    
//     if (!dbInitialized) {
//       console.log('❌ Проблемы с инициализацией базы данных');
//       console.log('💡 Убедитесь, что:');
//       console.log('   1. Таблицы созданы через SQL скрипт');
//       console.log('   2. Переменная POSTGRES_URL настроена корректно');
//       console.log('   3. База данных Neon доступна');
//     } else {
//       console.log('✅ База данных готова к работе');
//     }
    
//     server.listen(PORT, () => {
//       console.log('=================================');
//       console.log('🚀 Server running on port', PORT);
//       console.log('📊 Database: PostgreSQL (Neon)');
//       console.log('🔗 Health check: /api/health');
//       console.log('🔗 DB check: /api/db-check');
//       console.log('⏰ Почасовой учет посещаемости активирован');
//       console.log('🔌 WebSocket server ready');
//       console.log(`📚 Импорт студентов: ${studentsImported ? 'ВЫПОЛНЕН' : 'НЕ ВЫПОЛНЕН'}`);
//       console.log('=================================');
//     });
//   } catch (error) {
//     console.error('❌ Failed to start server:', error);
//     process.exit(1);
//   }
// }

// startServer();

// module.exports = app;
