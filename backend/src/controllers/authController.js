const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const axios = require('axios');

// In-memory store for OTPs: phone -> { otp, expiresAt }
const otpStore = {};

// Send OTP
exports.sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^\d{10}$/.test(phone.trim())) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
    }

    const cleanPhone = phone.trim();

    // Check if user already exists
    const userCheck = await db.query('SELECT * FROM users WHERE phone = $1', [cleanPhone]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User with this mobile number already exists' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    otpStore[cleanPhone] = { otp, expiresAt };

    const fast2smsKey = process.env.FAST2SMS_API_KEY;

    if (fast2smsKey) {
      console.log(`[Fast2SMS] Sending OTP ${otp} to ${cleanPhone}...`);
      try {
        const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${fast2smsKey}&variables_values=${otp}&route=otp&numbers=${cleanPhone}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.return === true) {
          console.log(`[Fast2SMS] OTP sent successfully to ${cleanPhone}`);
          return res.json({ message: 'OTP sent successfully' });
        } else {
          console.error('[Fast2SMS] API error response:', response.data);
          return res.status(500).json({ error: 'Failed to send OTP SMS' });
        }
      } catch (smsError) {
        console.error('[Fast2SMS] Request failed:', smsError.message);
        return res.status(500).json({ error: 'SMS Gateway communication error' });
      }
    }

    // Fallback: Generate 6-digit OTP locally
    console.log(`[OTP Simulator] Generated OTP ${otp} for phone ${cleanPhone}`);

    res.json({ message: 'OTP sent successfully (Simulated)', otp });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Register User
exports.register = async (req, res) => {
  try {
    const { name, phone, password, role, divisions, otp } = req.body;

    if (!name || !phone || !password || !role || !divisions || !otp) {
      return res.status(400).json({ error: 'All fields (name, phone, password, role, divisions, otp) are required' });
    }

    // Verify role (No commissioner or owner registration allowed)
    if (!['worker', 'supervisor'].includes(role)) {
      return res.status(400).json({ error: 'Registration is only allowed for Jawan (worker) or Sanitary Inspector (supervisor)' });
    }

    // Validate divisions
    const cleanPhone = phone.trim();
    const cleanDivs = divisions.trim();
    if (role === 'worker') {
      if (!/^\d+$/.test(cleanDivs)) {
        return res.status(400).json({ error: 'Jawan must enter a single numeric division number' });
      }
    } else if (role === 'supervisor') {
      const parts = cleanDivs.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length === 0) {
        return res.status(400).json({ error: 'Sanitary Inspector must enter at least one division number' });
      }
      if (parts.length > 15) {
        return res.status(400).json({ error: 'Sanitary Inspector can enter up to 15 divisions only' });
      }
      for (const part of parts) {
        if (!/^\d+$/.test(part)) {
          return res.status(400).json({ error: 'All division numbers must be numeric' });
        }
      }
    }

    // Check if user exists
    const userCheck = await db.query('SELECT * FROM users WHERE phone = $1', [cleanPhone]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Verify OTP from local memory
    const cachedOtp = otpStore[cleanPhone];
    if (!cachedOtp) {
      return res.status(400).json({ error: 'Please request an OTP first' });
    }
    if (Date.now() > cachedOtp.expiresAt) {
      delete otpStore[cleanPhone];
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }
    if (cachedOtp.otp !== otp.trim()) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    
    // Clear verified OTP
    delete otpStore[cleanPhone];

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user
    const newUser = await db.query(
      'INSERT INTO users (name, phone, password, role, divisions, approved) VALUES ($1, $2, $3, $4, $5, FALSE) RETURNING id, name, phone, role, divisions',
      [name, cleanPhone, hashedPassword, role, cleanDivs]
    );

    res.status(201).json({ 
      message: 'User registered successfully. Pending approval by the Commissioner.', 
      user: { ...newUser.rows[0], current_machine_id: null } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please enter your credentials' });
    }

    const cleanIdentifier = email.trim();

    // Find user by email or phone
    const userResult = await db.query('SELECT * FROM users WHERE email = $1 OR phone = $1', [cleanIdentifier]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = userResult.rows[0];

    // Check if user is approved
    if (user.approved === false) {
      return res.status(403).json({ error: 'Your registration is pending approval by the Commissioner.' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email || user.phone, role: user.role },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Logged in successfully',
      token,
      user: { id: user.id, name: user.name, email: user.email || user.phone, phone: user.phone, role: user.role, current_machine_id: user.current_machine_id, ward_id: user.ward_id }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

