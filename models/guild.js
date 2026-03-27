const mongoose = require('mongoose');

const GuildSchema = new mongoose.Schema({
  guildId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  hallChannelId: { 
    type: String, 
    required: true 
  }
});

module.exports = mongoose.model('Guild', GuildSchema);