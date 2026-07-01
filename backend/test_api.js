const axios = require('axios');

async function testApi() {
    try {
        // 1. Login as owner
        const loginRes = await axios.post('http://localhost:5000/api/login', {
            email: 'owner@example.com',
            password: 'password123'
        });
        
        const token = loginRes.data.token;
        console.log("Logged in:", loginRes.data.user.email);

        // 2. Fetch tasks
        const response = await axios.get('http://localhost:5000/api/tasks', {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log(`Status: ${response.status}`);
        console.log(`Data length: ${response.data.length}`);
        if(response.data.length > 0) {
            console.log("First task:", response.data[0].id, response.data[0].title);
        }
    } catch (error) {
        console.error('API Error:', error.response ? error.response.data : error.message);
    }
}

testApi();
