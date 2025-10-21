/**
 * Test Model: Post
 */

const { BaseModel } = require('../../../dist/ModelManager');

class Post extends BaseModel {
  static get tableName() {
    return 'posts';
  }

  static get schema() {
    return {
      timestamps: true,
      softDeletes: false,
      generateUuid: false,
      validationRules: {
        required: ['title', 'user_id'],
        types: {
          title: 'string',
          content: 'string',
          user_id: 'number',
          published: 'boolean',
        },
        length: {
          title: { min: 1, max: 255 },
          content: { max: 10000 },
        },
        range: {
          user_id: { min: 1 },
        },
      },
    };
  }

  static get relationMappings() {
    return {
      author: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: require('./User'),
        join: {
          from: 'posts.user_id',
          to: 'users.id',
        },
      },
    };
  }

  // Custom methods for testing
  getSlug() {
    return this.title
      ?.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  isPublished() {
    return this.published === true;
  }
}

module.exports = Post;
