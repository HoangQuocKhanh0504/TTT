const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('.'));

// Tạo thư mục
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// File paths
const TK_FILE = path.join(__dirname, 'tk.json');
const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const LOGIN_LOG_FILE = path.join(__dirname, 'logs', 'login_logs.json');
const REGISTER_LOG_FILE = path.join(__dirname, 'logs', 'register_logs.json');

// Tạo file mặc định
const createDefaultFiles = () => {
    if (!fs.existsSync(TK_FILE)) fs.writeFileSync(TK_FILE, '[]');
    if (!fs.existsSync(LOGIN_LOG_FILE)) fs.writeFileSync(LOGIN_LOG_FILE, '[]');
    if (!fs.existsSync(REGISTER_LOG_FILE)) fs.writeFileSync(REGISTER_LOG_FILE, '[]');
    
    if (!fs.existsSync(PRODUCTS_FILE)) {
        const products = [
            { id: 1, name: "FJ Titan X9", price: 45990000, image: "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=500", specs: "Intel i9-14900K | RTX 4090" },
            { id: 2, name: "FJ Phantom G5", price: 32990000, image: "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=500", specs: "Intel i7-14700HX | RTX 4070" }
        ];
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
    }
};

createDefaultFiles();

// Helper functions
const readFile = (file) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        return [];
    }
};

const writeFile = (file, data) => {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        return false;
    }
};

// ============ API ============

// 1. Register
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    console.log('📝 Register request:', { username, email });
    
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin!' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự!' });
    }
    
    const users = readFile(TK_FILE);
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại!' });
    }
    
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'Email đã được đăng ký!' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: Date.now(),
        username,
        email,
        password: hashedPassword,
        cart: [],
        loyaltyPoints: 0,
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    writeFile(TK_FILE, users);
    
    // Ghi log register
    const registerLogs = readFile(REGISTER_LOG_FILE);
    registerLogs.unshift({
        id: Date.now(),
        username,
        email,
        ip: req.ip || 'unknown',
        timestamp: new Date().toISOString()
    });
    writeFile(REGISTER_LOG_FILE, registerLogs);
    
    console.log('✅ Đăng ký thành công:', username);
    res.json({ success: true, message: 'Đăng ký thành công!' });
});

// 2. Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('🔐 Login request:', username);
    
    const users = readFile(TK_FILE);
    const user = users.find(u => u.username === username);
    
    if (!user) {
        // Ghi log thất bại
        const loginLogs = readFile(LOGIN_LOG_FILE);
        loginLogs.unshift({
            id: Date.now(),
            username,
            success: false,
            ip: req.ip || 'unknown',
            timestamp: new Date().toISOString()
        });
        writeFile(LOGIN_LOG_FILE, loginLogs);
        return res.status(401).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
        const loginLogs = readFile(LOGIN_LOG_FILE);
        loginLogs.unshift({
            id: Date.now(),
            username,
            success: false,
            ip: req.ip || 'unknown',
            timestamp: new Date().toISOString()
        });
        writeFile(LOGIN_LOG_FILE, loginLogs);
        return res.status(401).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
    }
    
    // Ghi log thành công
    const loginLogs = readFile(LOGIN_LOG_FILE);
    loginLogs.unshift({
        id: Date.now(),
        username,
        success: true,
        ip: req.ip || 'unknown',
        timestamp: new Date().toISOString()
    });
    writeFile(LOGIN_LOG_FILE, loginLogs);
    
    const { password: _, ...userInfo } = user;
    console.log('✅ Đăng nhập thành công:', username);
    res.json({ success: true, message: 'Đăng nhập thành công!', user: userInfo });
});

// 3. Get users (cho logs.html)
app.get('/api/admin/users', (req, res) => {
    const users = readFile(TK_FILE);
    const safeUsers = users.map(({ password, ...rest }) => rest);
    console.log(`📊 Trả về ${safeUsers.length} người dùng`);
    res.json(safeUsers);
});

// 4. Get login logs
app.get('/api/admin/login-logs', (req, res) => {
    const logs = readFile(LOGIN_LOG_FILE);
    console.log(`📊 Trả về ${logs.length} login logs`);
    res.json(logs);
});

// 5. Get register logs
app.get('/api/admin/register-logs', (req, res) => {
    const logs = readFile(REGISTER_LOG_FILE);
    console.log(`📊 Trả về ${logs.length} register logs`);
    res.json(logs);
});

// 6. Delete user
app.delete('/api/admin/user/:username', (req, res) => {
    const { username } = req.params;
    let users = readFile(TK_FILE);
    users = users.filter(u => u.username !== username);
    if (writeFile(TK_FILE, users)) {
        console.log(`🗑️ Đã xóa user: ${username}`);
        res.json({ success: true, message: 'Đã xóa!' });
    } else {
        res.status(500).json({ success: false, message: 'Lỗi!' });
    }
});

// 7. Products
app.get('/api/products', (req, res) => {
    res.json(readFile(PRODUCTS_FILE));
});

// 8. Update cart
app.post('/api/cart/update', (req, res) => {
    const { username, cart } = req.body;
    const users = readFile(TK_FILE);
    const index = users.findIndex(u => u.username === username);
    if (index !== -1) {
        users[index].cart = cart;
        writeFile(TK_FILE, users);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

// 9. Admin login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        res.json({ success: true, message: 'Admin login OK!' });
    } else {
        res.status(401).json({ success: false, message: 'Sai mật khẩu!' });
    }
});

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SERVER ĐANG CHẠY!');
    console.log(`📱 Website: http://localhost:${PORT}`);
    console.log(`📊 Logs: http://localhost:${PORT}/logs.html`);
    console.log(`🔑 Admin: admin / admin123`);
    console.log('='.repeat(50) + '\n');
});