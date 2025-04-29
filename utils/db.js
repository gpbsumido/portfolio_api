const { pool } = require('../config/database');

// Function to add a gallery item
async function addGalleryItem({ text, description, imageUrl, date }) {
    if (!text || !description || !imageUrl || !date) {
        throw new Error("Missing required fields: title, description, imageUrl, date");
    }

    const result = await pool.query(
        'INSERT INTO gallery (title, description, image_url, date) VALUES ($1, $2, $3, $4) RETURNING *',
        [text, description, imageUrl, date]
    );

    return result.rows[0];
}

// Function to delete a gallery item by ID
async function deleteGalleryItem(id) {
    if (!id) {
        throw new Error("Missing ID for deletion");
    }

    const query = `
        DELETE FROM gallery
        WHERE id = $1
        RETURNING *;
    `;
    const values = [id];

    const { rows } = await pool.query(query, values);
    return rows[0]; // Return the deleted record
}

// Function to get gallery items with pagination
async function getGalleryItems(pageNumber, limitNumber) {
    const offset = (pageNumber - 1) * limitNumber;

    const query = `
        SELECT *
        FROM gallery
        ORDER BY date DESC
        LIMIT $1 OFFSET $2;
    `;
    const values = [limitNumber, offset];

    const { rows } = await pool.query(query, values);
    return rows; // Return the list of gallery items
}

module.exports = {
    addGalleryItem,
    deleteGalleryItem,
    getGalleryItems
};
