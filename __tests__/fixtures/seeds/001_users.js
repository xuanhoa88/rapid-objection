/**
 * Test Seed: Users
 */

exports.seed = function (knex) {
  // Deletes ALL existing entries
  return knex('users')
    .del()
    .then(function () {
      // Inserts seed entries
      return knex('users').insert([
        {
          id: 1,
          name: 'John Doe',
          email: 'john@example.com',
          password: 'hashed_password_1',
          active: true,
        },
        {
          id: 2,
          name: 'Jane Smith',
          email: 'jane@example.com',
          password: 'hashed_password_2',
          active: true,
        },
        {
          id: 3,
          name: 'Bob Johnson',
          email: 'bob@example.com',
          password: 'hashed_password_3',
          active: false,
        },
      ]);
    });
};
