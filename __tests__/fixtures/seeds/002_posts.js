/**
 * Test Seed: Posts
 */

exports.seed = function (knex) {
  // Deletes ALL existing entries
  return knex('posts')
    .del()
    .then(function () {
      // Inserts seed entries
      return knex('posts').insert([
        {
          id: 1,
          title: 'First Post',
          content: 'This is the first post content',
          user_id: 1,
          published: true,
        },
        {
          id: 2,
          title: 'Second Post',
          content: 'This is the second post content',
          user_id: 1,
          published: false,
        },
        {
          id: 3,
          title: 'Third Post',
          content: 'This is the third post content',
          user_id: 2,
          published: true,
        },
      ]);
    });
};
