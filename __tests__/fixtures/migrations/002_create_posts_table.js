/**
 * Test Migration: Create Posts Table
 */

exports.up = function (knex) {
  return knex.schema.createTable('posts', function (table) {
    table.increments('id').primary();
    table.string('title').notNullable();
    table.text('content');
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.boolean('published').defaultTo(false);
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('posts');
};

exports.config = {
  transaction: true,
};
