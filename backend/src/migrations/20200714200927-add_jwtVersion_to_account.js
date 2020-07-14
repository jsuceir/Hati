'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.addColumn('Accounts', 'jwtVersion', {
      type: Sequelize.INTEGER,
      allowNull: false,
      after: 'tokens',
      defaultValue: 0,
    });
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('Accounts', 'jwtVersion');
  }
};