const axios = require('axios');
const jwt = require('jsonwebtoken');

const secret = 'quejwrllmnvfhshsjk__9920_58ujd';

async function testApi() {
    try {
        // Owner token
        const ownerToken = jwt.sign(
            { id: 3, email: 'owner@example.com', role: 'owner' },
            secret, { expiresIn: '1h' }
        );

        console.log('--- Fetching for Owner ---');
        let res = await axios.get('http://localhost:5000/api/tasks', {
            headers: { Authorization: `Bearer ${ownerToken}` }
        });
        console.log(`Status: ${res.status}, Length: ${res.data.length}`);
        if(res.data.length > 0) console.log("First Task ID:", res.data[0].id);

        // Supervisor token (let's assume supervisor_id 4)
        const supervisorToken = jwt.sign(
            { id: 4, email: 'supervisor@example.com', role: 'supervisor' },
            secret, { expiresIn: '1h' }
        );

        console.log('\n--- Fetching for Supervisor (ID 4) ---');
        res = await axios.get('http://localhost:5000/api/tasks', {
            headers: { Authorization: `Bearer ${supervisorToken}` }
        });
        console.log(`Status: ${res.status}, Length: ${res.data.length}`);
        if(res.data.length > 0) console.log("First Task ID:", res.data[0].id, "Ward:", res.data[0].ward_id);

    } catch (error) {
        console.error('API Error:', error.response ? error.response.data : error.message);
    }
}

testApi();
