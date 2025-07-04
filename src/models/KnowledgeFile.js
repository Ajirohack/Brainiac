const { Model, DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

class KnowledgeFile extends Model {
  static init(sequelize) {
    return super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: () => uuidv4(),
          primaryKey: true,
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        type: {
          type: DataTypes.ENUM('pdf', 'txt', 'md', 'zip', 'other'),
          allowNull: false,
        },
        size: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        path: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        status: {
          type: DataTypes.ENUM('uploading', 'processing', 'processed', 'failed'),
          defaultValue: 'uploading',
          allowNull: false,
        },
        chunks_count: {
          type: DataTypes.INTEGER,
          defaultValue: 0,
        },
        error: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        processed_at: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        created_by: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'Users',
            key: 'id',
          },
        },
      },
      {
        sequelize,
        modelName: 'KnowledgeFile',
        tableName: 'knowledge_files',
        timestamps: true,
        underscored: true,
        indexes: [
          {
            name: 'idx_knowledge_files_status',
            fields: ['status'],
          },
          {
            name: 'idx_knowledge_files_created_at',
            fields: ['created_at'],
          },
        ],
      }
    );
  }

  static associate(models) {
    // Association to User model
    this.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'uploadedBy',
    });
  }

  // Add any instance methods here
  getPublicFields() {
    const { path, error: _, ...publicFields } = this.toJSON();
    return publicFields;
  }
}

module.exports = KnowledgeFile;
