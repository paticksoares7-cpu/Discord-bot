require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');

const User = require('./models/user.js');
const Season = require('./models/season.js');
const Guild = require('./models/guild.js');

// Configurações
const RANKING_BANNER = 'https://i.pinimg.com/1200x/a6/d6/e5/a6d6e5881c691fc7a7a7db21eb17aed5.jpg';
const BITES_THE_DUST_GIF = 'https://static.jojowiki.com/images/2/21/latest/20191015213038/KQ_Bites_the_Dust.gif';
const SEU_ID_DONO = '878667031686295603';

function isValidMessage(msg) {
  const content = msg.trim();
  if (content.length < 3 || /^(.)\1+$/.test(content) || /^\p{Emoji}+$/u.test(content)) return false;
  return true;
}

// ===== SISTEMA DE TEMPORADA =====
async function sendSeasonEmbed(channel, seasonNumber) {
  const topUsers = await User.find({ fama: { $gt: 0 } }).sort({ fama: -1 }).limit(3);

  if (!topUsers.length) return channel.send('A temporada encerrou sem vencedores! 😅');

  const embed = new EmbedBuilder()
    .setTitle(`🏆 HALL DA FAMA — TEMPORADA ${seasonNumber}`)
    .setColor(0xF1C40F)
    .setDescription(`O tempo de glória chegou! Estes são os destaques da temporada.`)
    .setTimestamp();

  const medals = ['👑 Mastermind', '🌙 Moonlight', '☀️ Sunflare'];
  const colors = [0xF1C40F, 0x9B59B6, 0xE67E22];

  for (let i = 0; i < topUsers.length; i++) {
    const userData = topUsers[i];
    const guildMember = await channel.guild.members.fetch(userData.userId).catch(() => null);
    if (!guildMember) continue;

    const roleName = `${medals[i]} S${seasonNumber}`;

    let role = channel.guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      role = await channel.guild.roles.create({
        name: roleName,
        color: colors[i],
        reason: 'Sistema de temporada',
      });
    }

    if (role.position < channel.guild.members.me.roles.highest.position) {
      await guildMember.roles.add(role).catch(() => {});
    }

    embed.addFields({
      name: `\n${medals[i]}`,
      value: `${i + 1}º Lugar — ${guildMember} — ⭐ ${userData.fama}\nCargo: <@&${role.id}>`,
      inline: false,
    });
  }

  await channel.send({ embeds: [embed] });
}

// ===== CHECK AUTOMÁTICO =====
async function checkSeasonAuto(client) {
  const guildsConfig = await Guild.find();

  for (const config of guildsConfig) {
    const hallChannel = await client.channels.fetch(config.hallChannelId).catch(() => null);
    if (!hallChannel) continue;

    let season = await Season.findOne();

    if (!season) {
      season = new Season({
        start: new Date(),
        seasonNumber: 1,
        durationDays: 30
      });
      await season.save();
      continue;
    }

    const now = new Date();
    const diffDays = Math.ceil(Math.abs(now - season.start) / (1000 * 60 * 60 * 24));

    if (diffDays >= season.durationDays) {

      // 🔒 PROTEÇÃO CONTRA DUPLICAÇÃO
      const diffMinutes = Math.abs(now - season.start) / (1000 * 60);
      if (diffMinutes < 5) continue;

      await sendSeasonEmbed(hallChannel, season.seasonNumber);

      await User.updateMany({}, { fama: 0 });

      season.start = new Date();
      season.seasonNumber += 1;

      await season.save();
    }
  }
}

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Database Conectada'))
  .catch(err => console.error('🔴 Erro na Database:', err));

client.once('ready', () => {
  console.log(`🔥 Midnight-BOT Online: ${client.user.tag}`);

  checkSeasonAuto(client);
  setInterval(() => checkSeasonAuto(client), 1000 * 60 * 60);
});

// ===== EVENTO =====
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim().toLowerCase();
  const args = message.content.split(' ');

  // ===== AJUDA =====
  if (content === '!ajuda') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📖 GUIA DE COMANDOS — MIDNIGHT')
      .setColor(0x3498DB)
      .setDescription('Comandos disponíveis:')
      .addFields(
        {
          name: '⭐ Membros',
          value: '!fama - Veja sua pontuação.\n!ranking - Top 10.\n!var @user - Ver fama de outro usuário.'
        },
        {
          name: '🛠️ Staff',
          value: '!apresentacao\n!sethall #canal\n!addfama @user valor\n!remfama @user valor\n!fimseason\n!resetseason\n!bitesthedust'
        }
      );

    return message.reply({ embeds: [helpEmbed] });
  }

  // ===== !VAR =====
  if (content.startsWith('!var')) {
    const target = message.mentions.users.first();

    if (!target) {
      return message.reply('❌ Use: !var @usuario');
    }

    const user = await User.findOne({ userId: target.id });

    return message.reply(`⭐ ${target} possui **${user ? user.fama : 0}** de fama`);
  }

  // ===== APRESENTAÇÃO =====
  if (content === '!apresentacao' && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    const introEmbed = new EmbedBuilder()
      .setTitle('🏆 BEM-VINDO AO HALL DA FAMA OFICIAL')
      .setColor(0xF1C40F)
      .setDescription(`*Aqui ficam registrados os maiores jogadores de cada temporada.*
*Somente os 3 membros com mais Fama entram para a história.*

————————————

📅 **Como funciona?**
• Cada temporada tem duração definida.
• Ao final, o Top 3 é registrado aqui.
• A Fama é resetada para uma nova disputa.
• Os vencedores recebem cargo exclusivo.

————————————

🔥 **Quer entrar para o Hall da Fama?**
*Participe, interaja e suba no ranking.*
A próxima lenda pode ser você.`);

    const msg = await message.channel.send({ embeds: [introEmbed] });
    await msg.pin().catch(() => {});
    return message.delete().catch(() => {});
  }

  // ===== BITES THE DUST =====
  if (content === '!bitesthedust' && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await User.updateMany({}, { fama: 0 });

    let season = await Season.findOne() || new Season();
    season.seasonNumber = 1;
    season.start = new Date();
    await season.save();

    const embed = new EmbedBuilder()
      .setTitle('⏳ KILLER QUEEN: BITES THE DUST!')
      .setImage(BITES_THE_DUST_GIF)
      .setColor(0xFF0000);

    return message.channel.send({ embeds: [embed] });
  }

  // ===== DONO =====
  if (content === '!restart' && message.author.id === SEU_ID_DONO) {
    await message.reply("🔄 Reiniciando...");
    return process.exit();
  }

  // ===== GANHO DE FAMA =====
  if (!content.startsWith('!') && isValidMessage(content)) {
    let user = await User.findOne({ userId: message.author.id }) || new User({ userId: message.author.id });

    user.fama += 1;
    await user.save();
    return;
  }

  // ===== STAFF =====
  if (message.member.permissions.has(PermissionFlagsBits.Administrator)) {

    if (content.startsWith('!sethall')) {
      const channel = message.mentions.channels.first();

      if (!channel) return message.reply("❌ Mencione o canal.");

      await Guild.findOneAndUpdate(
        { guildId: message.guild.id },
        { hallChannelId: channel.id },
        { upsert: true }
      );

      return message.reply(`✅ Canal configurado: ${channel}`);
    }

    if (content.startsWith('!addfama')) {
      const target = message.mentions.users.first();
      const amt = parseInt(args[2]);

      if (!target || isNaN(amt)) return message.reply("Use: !addfama @user valor.");

      let user = await User.findOne({ userId: target.id }) || new User({ userId: target.id });

      user.fama += amt;
      await user.save();

      return message.reply(`⭐ ${target} agora tem ${user.fama}`);
    }

    if (content.startsWith('!remfama')) {
      const target = message.mentions.users.first();
      const amt = parseInt(args[2]);

      if (!target || isNaN(amt)) {
        return message.reply("Use: !remfama @user valor.");
      }

      let user = await User.findOne({ userId: target.id }) || new User({ userId: target.id });

      user.fama -= amt;
      if (user.fama < 0) user.fama = 0;

      await user.save();

      return message.reply(`❌ ${target} agora tem ${user.fama} de fama`);
    }

    if (content === '!fimseason') {
      let season = await Season.findOne() || new Season({ seasonNumber: 1 });

      await sendSeasonEmbed(message.channel, season.seasonNumber);
      await User.updateMany({}, { fama: 0 });

      season.start = new Date();
      season.seasonNumber += 1;

      await season.save();

      return message.reply('✅ Temporada finalizada!');
    }

    if (content === '!resetseason') {
      let season = await Season.findOne();

      if (!season) {
        season = new Season({
          seasonNumber: 1,
          start: new Date(),
          durationDays: 30
        });
        await season.save();
      }

      await sendSeasonEmbed(message.channel, season.seasonNumber);
      await User.updateMany({}, { fama: 0 });

      season.start = new Date();

      await season.save();

      return message.reply(`🔄 Temporada resetada! Ainda estamos na Season ${season.seasonNumber}`);
    }
  }

  // ===== RESTO =====
  const guildConfig = await Guild.findOne({ guildId: message.guild.id });

  if (!guildConfig || message.channel.id !== guildConfig.hallChannelId) return;

  if (content === '!ranking') {
    const top = await User.find({ fama: { $gt: 0 } }).sort({ fama: -1 }).limit(10);

    const embed = new EmbedBuilder()
      .setTitle('🏆 RANKING DE FAMA - TOP 10')
      .setColor(0xF1C40F)
      .setThumbnail(RANKING_BANNER)
      .setDescription(
        top.map((u, i) =>
          `${i < 3 ? ['🥇','🥈','🥉'][i] : `**${i+1}º**`} <@${u.userId}> — ⭐ **${u.fama}**`
        ).join('\n') || "Vazio."
      );

    return message.reply({ embeds: [embed] });
  }

  if (content === '!fama') {
    const user = await User.findOne({ userId: message.author.id });

    return message.reply(`⭐ Sua fama atual: **${user ? user.fama : 0}**`);
  }
});

client.login(process.env.TOKEN);
