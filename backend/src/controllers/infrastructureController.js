const db = require('../config/db');

let duplicateLineIdsCache = null;

exports.getInfrastructure = async (req, res) => {
    try {
        const { minLat, maxLat, minLng, maxLng, type, limit = 500, latDelta } = req.query;

        // Zoom-level gating: latDelta tells us how zoomed in the user is
        const zoomDelta = parseFloat(latDelta) || 0.05;
        const isZoomedIn  = zoomDelta < 0.08;   // ~street level
        const isMidZoom   = zoomDelta < 0.15;   // ~neighbourhood

        // Simplification tolerance — bigger = fewer vertices, faster render
        const tolerance = isZoomedIn ? 0.00003 : (isMidZoom ? 0.0001 : 0.0003);

        // When zoomed far out, skip roads entirely (they'd be invisible anyway)
        let typeFilter = type || null;
        if (!typeFilter && !isZoomedIn && !isMidZoom) {
            // Only show ward boundaries at city zoom (except for workers/supervisors already constrained by ward)
            if (!req.user || (req.user.role !== 'worker' && req.user.role !== 'supervisor')) {
                typeFilter = 'ward';
            }
        }

        // Fetch worker ward if role is worker
        let workerWardName = null;
        let workerWardNum = null;

        if (req.user && (req.user.role === 'worker' || req.user.role === 'park_jawan')) {
            const isHighwayJawan = req.user.email === 'jawan_highway@test.com' || req.user.email === 'jawan_highway' || req.user.email === 'jawan_61';
            if (isHighwayJawan) {
                workerWardName = 'Ward 61';
                workerWardNum = '61';
            } else {
                const userRes = await db.query(
                    `SELECT u.ward_id, w.name as ward_name
                     FROM users u
                     LEFT JOIN wards w ON u.ward_id = w.id
                     WHERE u.id = $1`,
                    [req.user.id]
                );
                if (userRes.rows.length > 0 && userRes.rows[0].ward_id) {
                    workerWardName = userRes.rows[0].ward_name;
                    const match = workerWardName.match(/Ward\s+(\d+)/i);
                    if (match) {
                        workerWardNum = match[1];
                    }
                } else {
                    // Fallback to tasks if ward_id is not assigned on user profile
                    const taskRes = await db.query(
                        `SELECT w.name as ward_name 
                         FROM tasks t
                         LEFT JOIN wards w ON t.ward_id = w.id
                         WHERE t.assigned_worker_id = $1 AND t.ward_id IS NOT NULL
                         LIMIT 1`,
                        [req.user.id]
                    );
                    if (taskRes.rows.length > 0) {
                        workerWardName = taskRes.rows[0].ward_name;
                        const match = workerWardName.match(/Ward\s+(\d+)/i);
                        if (match) {
                            workerWardNum = match[1];
                        }
                    }
                }
            }
        }

        let query = "";
        let params = [];

        if (req.user && (req.user.role === 'worker' || req.user.role === 'park_jawan') && workerWardName) {
            const isParkJawan = req.user.role === 'park_jawan';
            const isHighwayJawan = req.user.email === 'jawan_highway@test.com' || req.user.email === 'jawan_highway' || req.user.email === 'jawan_61';

            if (isParkJawan) {
                params.push(tolerance); // $1
                let envCondition = "";
                let envelopeParams = [];
                if (minLat && maxLat && minLng && maxLng) {
                    envCondition = `AND r.geom && ST_MakeEnvelope($2, $3, $4, $5, 4326)`;
                    envelopeParams = [parseFloat(minLng), parseFloat(minLat), parseFloat(maxLng), parseFloat(maxLat)];
                    params.push(...envelopeParams);
                }
                const limitIdx = params.length + 1;
                params.push(parseInt(limit));
                query = `
                    SELECT r.id, r.name, r.type, r.properties,
                           ST_AsGeoJSON(ST_SimplifyPreserveTopology(r.geom, $1)) as geom_json
                    FROM infrastructure r
                    WHERE r.type = 'ward' ${envCondition}
                    LIMIT $${limitIdx}
                `;
            } else {
                let envCondition = "";
                params.push(workerWardName); // $1
                params.push(tolerance); // $2
                
                let envelopeParams = [];
                if (minLat && maxLat && minLng && maxLng) {
                    envCondition = `AND r.geom && ST_MakeEnvelope($3, $4, $5, $6, 4326)`;
                    envelopeParams = [parseFloat(minLng), parseFloat(minLat), parseFloat(maxLng), parseFloat(maxLat)];
                    params.push(...envelopeParams);
                }
                
                const nextIdx = params.length + 1;
                params.push(workerWardNum || ""); // $nextIdx
                params.push(parseInt(limit)); // $nextIdx + 1
 
                if (isHighwayJawan) {
                    query = `
                        SELECT r.id, r.name, r.type, r.properties,
                               ST_AsGeoJSON(ST_SimplifyPreserveTopology(r.geom, $2)) as geom_json
                        FROM infrastructure r
                        WHERE 1=1 ${envCondition}
                          AND (
                            (r.type = 'ward' AND LOWER(r.name) = LOWER($1))
                            OR (r.type = 'road' AND r.properties->>'Ward_No' = $${nextIdx})
                            OR (r.type = 'row' AND EXISTS (
                              SELECT 1 FROM infrastructure w 
                              WHERE w.type = 'ward' AND LOWER(w.name) = LOWER($1) 
                                AND ST_Intersects(r.geom, w.geom)
                            ))
                          )
                        ORDER BY CASE WHEN r.type = 'road' THEN 0 WHEN r.type = 'row' THEN 1 ELSE 2 END ASC
                        LIMIT $${nextIdx + 1}
                    `;
                } else {
                    query = `
                        SELECT r.id, r.name, r.type, r.properties,
                               ST_AsGeoJSON(ST_SimplifyPreserveTopology(r.geom, $2)) as geom_json
                        FROM infrastructure r
                        WHERE 1=1 ${envCondition}
                          AND (
                            (r.type = 'ward' AND LOWER(r.name) = LOWER($1))
                            OR (r.type = 'road' AND (
                              r.properties->>'Ward_No' = $${nextIdx} 
                              OR EXISTS (
                                SELECT 1 FROM infrastructure w 
                                WHERE w.type = 'ward' AND LOWER(w.name) = LOWER($1) 
                                  AND ST_Intersects(r.geom, w.geom)
                              )
                            ))
                            OR (r.type = 'row' AND EXISTS (
                              SELECT 1 FROM infrastructure w 
                              WHERE w.type = 'ward' AND LOWER(w.name) = LOWER($1) 
                                AND ST_Intersects(r.geom, w.geom)
                            ))
                          )
                        ORDER BY CASE WHEN r.type = 'road' THEN 0 WHEN r.type = 'row' THEN 1 ELSE 2 END ASC
                        LIMIT $${nextIdx + 1}
                    `;
                }
            }
        } else if (req.user && req.user.role === 'supervisor') {
            // Fetch supervisor wards
            const wardsRes = await db.query('SELECT name FROM wards WHERE supervisor_id = $1', [req.user.id]);
            const supervisorWardNames = wardsRes.rows.map(w => w.name);
            const supervisorWardNums = supervisorWardNames.map(name => {
                const match = name.match(/Ward\s+(\d+)/i);
                return match ? match[1] : null;
            }).filter(Boolean);

            if (supervisorWardNames.length === 0) {
                return res.json([]);
            }

            let envCondition = "";
            params.push(supervisorWardNames); // $1
            params.push(tolerance); // $2

            let envelopeParams = [];
            if (minLat && maxLat && minLng && maxLng) {
                envCondition = `AND r.geom && ST_MakeEnvelope($3, $4, $5, $6, 4326)`;
                envelopeParams = [parseFloat(minLng), parseFloat(minLat), parseFloat(maxLng), parseFloat(maxLat)];
                params.push(...envelopeParams);
            }

            const nextIdx = params.length + 1;
            params.push(supervisorWardNums); // $nextIdx
            params.push(parseInt(limit)); // $nextIdx + 1

            query = `
                WITH supervisor_wards AS (
                    SELECT geom FROM infrastructure WHERE type = 'ward' AND name = ANY($1)
                )
                SELECT r.id, r.name, r.type, r.properties,
                       ST_AsGeoJSON(ST_SimplifyPreserveTopology(r.geom, $2)) as geom_json
                FROM infrastructure r
                WHERE 1=1 ${envCondition}
                  AND (
                    (r.type = 'ward' AND r.name = ANY($1))
                    OR (r.type = 'road' AND (
                      (r.properties->>'Ward_No' IS NOT NULL AND r.properties->>'Ward_No' = ANY($${nextIdx}))
                      OR (r.properties->>'Ward_No' IS NULL AND EXISTS (
                        SELECT 1 FROM supervisor_wards sw WHERE ST_Intersects(r.geom, sw.geom)
                      ))
                    ))
                    OR (r.type = 'row' AND EXISTS (
                      SELECT 1 FROM supervisor_wards sw WHERE ST_Intersects(r.geom, sw.geom)
                    ))
                  )
                ORDER BY CASE WHEN r.type = 'road' THEN 0 WHEN r.type = 'row' THEN 1 ELSE 2 END ASC
                LIMIT $${nextIdx + 1}
            `;
        } else {
            // General query for other roles
            let conditions = [];
            if (minLat && maxLat && minLng && maxLng) {
                conditions.push(`geom && ST_MakeEnvelope($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, 4326)`);
                params.push(parseFloat(minLng), parseFloat(minLat), parseFloat(maxLng), parseFloat(maxLat));
            }

            if (typeFilter) {
                conditions.push(`type = $${params.length + 1}`);
                params.push(typeFilter);
            }

            const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
            query = `
                SELECT id, name, type, properties,
                       ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, $${params.length + 1})) as geom_json
                FROM infrastructure
                ${where}
                ORDER BY CASE WHEN type = 'road' THEN 0 WHEN type = 'row' THEN 1 ELSE 2 END ASC
                LIMIT $${params.length + 2}
            `;
            params.push(tolerance, parseInt(limit));
        }

        const result = await db.query(query, params);

        // Fetch duplicate Line_IDs globally in the database (cached in-memory)
        if (!duplicateLineIdsCache) {
            const dupRes = await db.query(
              `SELECT properties->>'Line_ID' as line_id 
               FROM infrastructure 
               WHERE properties->>'Line_ID' IS NOT NULL 
               GROUP BY properties->>'Line_ID' 
               HAVING COUNT(*) > 1`
            );
            duplicateLineIdsCache = new Set(dupRes.rows.map(row => row.line_id));
        }
        const duplicateLineIds = duplicateLineIdsCache;

        const processedRows = result.rows.map(r => {
            if (r.type === 'road' && r.properties && r.properties.Line_ID) {
                const lineId = r.properties.Line_ID;
                if (duplicateLineIds.has(lineId)) {
                    const suffixed = `${lineId}_${r.id}`;
                    return {
                        ...r,
                        properties: {
                            ...r.properties,
                            Line_ID: suffixed,
                            line_id: suffixed
                        }
                    };
                }
            }
            return r;
        });

        res.json(processedRows.filter(r => r.geom_json !== null));
    } catch (error) {
        console.error('Get infrastructure error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

/**
 * GET /infrastructure/ward-boundary
 * Returns the geometry of the ward that this worker is assigned to,
 * derived from the ward_name on their tasks, matched to the infrastructure table.
 */
exports.getWorkerWard = async (req, res) => {
    try {
        const workerId = req.user.id;

        // Find the ward name from the worker's user record first
        const userRes = await db.query(
            `SELECT u.ward_id, w.name as ward_name
             FROM users u
             LEFT JOIN wards w ON u.ward_id = w.id
             WHERE u.id = $1`,
            [workerId]
        );

        let wardName = null;
        if (userRes.rows.length > 0 && userRes.rows[0].ward_id) {
            wardName = userRes.rows[0].ward_name;
        } else {
            // Fallback to tasks if ward_id is not assigned on user profile
            const wardRes = await db.query(
                `SELECT w.name as ward_name 
                 FROM tasks t
                 LEFT JOIN wards w ON t.ward_id = w.id
                 WHERE t.assigned_worker_id = $1 AND t.ward_id IS NOT NULL
                 LIMIT 1`,
                [workerId]
            );
            if (wardRes.rows.length > 0) {
                wardName = wardRes.rows[0].ward_name;
            }
        }

        if (!wardName) {
            return res.status(404).json({ error: 'No assigned ward found' });
        }

        // Fetch the ward polygon geometry from infrastructure
        const geoRes = await db.query(
            `SELECT id, name, type,
                    ST_AsGeoJSON(geom) as geom_json,
                    ST_XMin(geom::geometry) as min_lng,
                    ST_YMin(geom::geometry) as min_lat,
                    ST_XMax(geom::geometry) as max_lng,
                    ST_YMax(geom::geometry) as max_lat
             FROM infrastructure
             WHERE type = 'ward' AND LOWER(name) LIKE LOWER($1)
             LIMIT 1`,
            [`%${wardName}%`]
        );

        if (geoRes.rows.length === 0) {
            return res.status(404).json({ error: `Ward '${wardName}' not found in infrastructure` });
        }

        const row = geoRes.rows[0];
        res.json({
            wardName,
            id: row.id,
            geom_json: row.geom_json,
            bbox: {
                minLat: parseFloat(row.min_lat),
                maxLat: parseFloat(row.max_lat),
                minLng: parseFloat(row.min_lng),
                maxLng: parseFloat(row.max_lng),
            }
        });
    } catch (error) {
        console.error('Get worker ward error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};
