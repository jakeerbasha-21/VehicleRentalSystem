const express = require("express");
const mysql = require("mysql8");
const path = require("path");

const app = express();
const PORT = 3000;

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve HTML, CSS and JavaScript from public folder
app.use(express.static(path.join(__dirname, "public")));

// ================= MYSQL CONNECTION =================
const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "jake",
    database: "vehicle_rental",
    waitForConnections: true,
    connectionLimit: 10
});

// Test MySQL connection
db.getConnection((err, connection) => {
    if (err) {
        console.error("MySQL connection failed:", err.message);
        return;
    }

    console.log("MySQL connected successfully!");
    connection.release();
});

// ================= GET ALL VEHICLES =================
app.get("/api/vehicles", (req, res) => {
    const sql = "SELECT * FROM vehicles ORDER BY veh_id DESC";

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Fetch error:", err.message);
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        res.json(results);
    });
});

// ================= GET ONE VEHICLE =================
app.get("/api/vehicles/:veh_id", (req, res) => {
    const id = Number(req.params.veh_id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid vehicle ID."
        });
    }

    db.query(
        "SELECT * FROM vehicles WHERE veh_id = ?",
        [id],
        (err, results) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Vehicle not found."
                });
            }

            res.json(results[0]);
        }
    );
});

// ================= ADD VEHICLE =================
app.post("/api/vehicles", (req, res) => {
    const {
        veh_no,
        veh_type,
        veh_model,
        veh_rent_per_day,
        veh_status
    } = req.body;

    if (
        typeof veh_no !== "string" || !veh_no.trim() ||
        typeof veh_type !== "string" || !veh_type.trim() ||
        typeof veh_model !== "string" || !veh_model.trim() ||
        veh_rent_per_day === "" ||
        veh_rent_per_day === undefined ||
        !veh_status
    ) {
        return res.status(400).json({
            success: false,
            message: "Please fill in all required fields."
        });
    }

    const rent = Number(veh_rent_per_day);

    if (!Number.isFinite(rent) || rent < 0) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid daily rent."
        });
    }

    const sql = `
        INSERT INTO vehicles
        (veh_no, veh_type, veh_model, veh_rent_per_day, veh_status)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            veh_no.trim(),
            veh_type.trim(),
            veh_model.trim(),
            rent,
            veh_status
        ],
        (err, result) => {
            if (err) {
                console.error("Insert error:", err.message);

                return res.status(500).json({
                    success: false,
                    message: err.code === "ER_DUP_ENTRY"
                        ? "This vehicle number already exists."
                        : err.message
                });
            }

            res.status(201).json({
                success: true,
                message: "Vehicle added successfully!",
                veh_id: result.insertId
            });
        }
    );
});

// ================= SEARCH VEHICLES =================
app.get("/api/search", (req, res) => {
    const {
        veh_no = "",
        veh_type = "All",
        veh_status = "All",
        budget = ""
    } = req.query;

    let sql = "SELECT * FROM vehicles WHERE 1=1";
    const values = [];

    if (veh_no.trim()) {
        sql += " AND veh_no LIKE ?";
        values.push("%" + veh_no.trim() + "%");
    }

    if (veh_type !== "All") {
        sql += " AND UPPER(veh_type) = UPPER(?)";
        values.push(veh_type);
    }

    if (veh_status !== "All") {
        sql += " AND UPPER(veh_status) = UPPER(?)";
        values.push(veh_status);
    }

    if (budget !== "") {
        const maxRent = Number(budget);

        if (!Number.isFinite(maxRent) || maxRent < 0) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid budget."
            });
        }

        sql += " AND veh_rent_per_day <= ?";
        values.push(maxRent);
    }

    sql += " ORDER BY veh_id DESC";

    db.query(sql, values, (err, results) => {
        if (err) {
            console.error("Search error:", err.message);

            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        res.json({
            success: true,
            count: results.length,
            vehicles: results
        });
    });
});

// ================= UPDATE VEHICLE =================

app.put("/api/vehicles/:veh_id", (req, res) => {
    console.log("UPDATE ROUTE HIT:", req.method, req.originalUrl);
    const veh_id = req.params.veh_id;

    const {
        veh_type,
        veh_model,
        veh_rent_per_day,
        veh_status
    } = req.body;

    // Validate input fields
    if (
        !veh_type ||
        !veh_model ||
        veh_rent_per_day === undefined ||
        !veh_status
    ) {
        return res.status(400).json({
            message: "Please fill all vehicle details"
        });
    }

    const rent = Number(veh_rent_per_day);

    if (!Number.isFinite(rent) || rent <= 0) {
        return res.status(400).json({
            message: "Rent must be a number greater than zero"
        });
    }

    const sql = `
        UPDATE vehicles
        SET veh_type = ?,
            veh_model = ?,
            veh_rent_per_day = ?,
            veh_status = ?
        WHERE veh_id = ?
    `;

    db.query(
        sql,
        [veh_type, veh_model, rent, veh_status, veh_id],
        (err, result) => {
            if (err) {
                console.error("Update error:", err);

                return res.status(500).json({
                    message: "Database update failed",
                    error: err.message
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: "Vehicle ID not found"
                });
            }

            return res.status(200).json({
                message: "Vehicle updated successfully!",
                vehicle_id: veh_id
            });
        }
    );
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});


// ================= DELETE VEHICLE =================

app.delete("/api/vehicles/:veh_id", (req, res) => {
    const veh_id = req.params.veh_id;

    const sql = "DELETE FROM vehicles WHERE veh_id = ?";

    db.query(sql, [veh_id], (err, result) => {
        if (err) {
            console.error("Delete error:", err);

            return res.status(500).json({
                message: "Database delete failed",
                error: err.message
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Vehicle ID not found"
            });
        }

        return res.json({
            message: "Vehicle deleted successfully!",
            vehicle_id: veh_id
        });
    });
});

// ================= START SERVER =================
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});