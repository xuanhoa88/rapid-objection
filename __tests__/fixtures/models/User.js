/**
 * Test Model: User
 */

const { BaseModel } = require('../../../dist/ModelManager');

class User extends BaseModel {
  static get tableName() {
    return 'users';
  }

  static get schema() {
    return {
      timestamps: true,
      softDeletes: false,
      generateUuid: false,
      validationRules: {
        required: ['name', 'email'],
        types: {
          name: 'string',
          email: 'string',
          active: 'boolean',
        },
        length: {
          name: { min: 2, max: 100 },
          email: { min: 5, max: 255 },
        },
        patterns: {
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        },
      },
    };
  }

  static get relationMappings() {
    return {
      posts: {
        relation: BaseModel.HasManyRelation,
        modelClass: require('./Post'),
        join: {
          from: 'users.id',
          to: 'posts.user_id',
        },
      },
    };
  }

  // Custom methods for testing
  getDisplayName() {
    return this.name;
  }

  isActive() {
    return this.active === true;
  }
}

module.exports = User;
