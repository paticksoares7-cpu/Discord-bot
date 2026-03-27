require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const User = require('./models/user.js');
const Season = require('./models/season.js');
const Guild = require('./models/guild.js');

// Configurações de Imagens
const RANKING_BANNER = 'https://i.pinimg.com/1200x/a6/d6/e5/a6d6e5881c691fc7a7a7db21eb17aed5.jpg';
const BITES_THE_DUST_GIF = 'https://static.jojowiki.com/images/2/21/latest/20191015213038/KQ_Bites_the_Dust.gif';

// === COLOQUE SEU ID AQUI PARA O COMANDO !RESTART ===
const SEU_ID_DONO = '878667031686295603'; 

function isValidMessage(msg) {
  const content = msg.trim();
  if (content.length < 3 || /^(.)\1+$/.test(content) || /^\p{Emoji}+$/u.test(content)) return false;
  return true;
}

// === FUNÇÃO: HALL DA FAMA (ENTREGA DE PRÊMIOS) ===
async function sendSeasonEmbed(channel, seasonNumber) {
  const topUsers = await User.find({ fama: { $gt: 0 } }).sort({ fama: -1 }).limit(3);
  if (!topUsers.length) return channel.send('A temporada encerrou sem vencedores! 😅');

  const embed = new EmbedBuilder()
    .setTitle(`🏆 HALL DA FAMA — TEMPORADA ${seasonNumber}`)
    .setColor(0xF1C40F)
    .setDescription(`O tempo de glória chegou! Estes são os destaques da temporada.`)
    .setTimestamp();

  const medals = ['👑 Mastermind', '✨ Bejeweled', '⭐ Starlight'];
  const colors = [0xF1C40F, 0x3498DB, 0x2ECC71]; 

  for (let i = 0; i < topUsers.length; i++) {
    const userData = topUsers[i];
    const guildMember = await channel.guild.members.fetch(userData.userId).catch(() => null);
    const userMention = guildMember ? guildMember.toString() : `<@${userData.userId}>`;

    const roleName = `${medals[i]} S${seasonNumber}`;
    let role = channel.guild.roles.cache.find(r => r.name === roleName);
    if (!role) role = await channel.guild.roles.create({ name: roleName, color: colors[i] });

    if (guildMember) await guildMember.roles.add(role).catch(() => {});

    embed.addFields({
      name: `\n${medals[i]}`,
      value: `${i + 1}º Lugar — ${userMention} — ⭐ ${userData.fama}\nCargo: ${role.toString()}`,
      inline: false,
    });
  }
  await channel.send({ embeds: [embed] });
}

// === CHECK AUTOMÁTICO (RODA A CADA 1 HORA) ===
async function checkSeasonAuto(client) {
  const guildsConfig = await Guild.find();
  for (const config of guildsConfig) {
    const hallChannel = await client.channels.fetch(config.hallChannelId).catch(() => null);
    if (!hallChannel) continue;

    let season = await Season.findOne();
    if (!season) {
      season = new Season({ start: new Date(), seasonNumber: 1, durationDays: 30 });
      await season.save();
      continue;
    }

    const diffDays = Math.ceil(Math.abs(new Date() - season.start) / (1000 * 60 * 60 * 24));
    if (diffDays >= season.durationDays) {
      await sendSeasonEmbed(hallChannel, season.seasonNumber);
      await User.updateMany({}, { fama: 0 });
      season.start = new Date();
      season.seasonNumber += 1;
      await season.save();
    }
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

mongoose.connect(process.env.MONGO_URI).then(() => console.log('🟢 Database Conectada'));

client.once('ready', () => {
  console.log(`🔥 Midnight-BOT Online: ${client.user.tag}`);
  setInterval(() => checkSeasonAuto(client), 1000 * 60 * 60);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim().toLowerCase();
  const args = message.content.split(' ');

  // === COMANDO AJUDA ===
  if (content === '!ajuda') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📖 GUIA DE COMANDOS — MIDNIGHT')
      .setColor(0x3498DB)
      .setThumbnail(client.user.displayAvatarURL())
      .setDescription('Comandos disponíveis:')
      .addFields({ name: '⭐ Membros', value: '`!fama` - Veja sua pontuação.\n`!ranking` - Top 10 da temporada.' });

    if (message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      helpEmbed.addFields({ 
        name: '🛠️ Staff (Administração)', 
        value: '`!sethall #canal` - Configura o canal oficial.\n`!apresentacao` - Mensagem fixa de boas-vindas.\n`!addfama @user valor` - Dá pontos.\n`!remfama @user valor` - Tira pontos.\n`!fimseason` - Encerra e pula para próxima Season.\n`!resetseason` - Zera pontos da season atual s/ mudar o número.\n`!bitesthedust` - Reset total para Season 1.' 
      });
    }
    return message.reply({ embeds: [helpEmbed] });
  }

  // === RESTART (SÓ VOCÊ) ===
  if (content === '!restart' && message.author.id === SEU_ID_DONO) {
    await message.reply("🔄 Reiniciando sistemas...");
    process.exit();
  }

  // 1. Ganho Passivo de Fama
  if (!content.startsWith('!') && isValidMessage(content)) {
    let user = await User.findOne({ userId: message.author.id }) || new User({ userId: message.author.id });
    user.fama += 1;
    await user.save();
    return;
  }

  // 2. Comandos de Staff (Apenas ADMs)
  if (message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    
    // Configura o Canal GPS
    if (content.startsWith('!sethall')) {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply("❌ Mencione o canal! Ex: `!sethall #canal`.");
      await Guild.findOneAndUpdate({ guildId: message.guild.id }, { hallChannelId: channel.id }, { upsert: true });
      return message.reply(`✅ Canal configurado com sucesso: ${channel}`);
    }

    // Mensagem de Boas-Vindas
    if (content === '!apresentacao') {
      const introEmbed = new EmbedBuilder()
        .setTitle('🏆 BEM-VINDO AO HALL DA FAMA')
        .setColor(0xF1C40F)
        .setDescription('*Os 3 maiores jogadores da temporada entram para a história.*')
        .addFields(
            { name: '📅 Funcionamento', value: 'Temporadas mensais. O Top 3 ganha cargos exclusivos e a fama reseta.' },
            { name: '🥇 Cargos de Prestígio', value: '1. Mastermind\n2. Bejeweled\n3. Starlight' }
        );
      const msg = await message.channel.send({ embeds: [introEmbed] });
      await msg.pin().catch(() => {});
      return message.delete().catch(() => {});
    }

    // Reset de Season (Zera fama e tempo, mas mantém o número da Season)
    if (content === '!resetseason') {
        await User.updateMany({}, { fama: 0 });
        let season = await Season.findOne();
        if (season) { season.start = new Date(); await season.save(); }
        return message.reply('🔄 Temporada atual reiniciada (pontos zerados e cronômetro resetado).');
    }

    // Bites The Dust (Reset Total)
    if (content === '!bitesthedust') {
      await User.updateMany({}, { fama: 0 });
      let season = await Season.findOne() || new Season();
      season.seasonNumber = 1; season.start = new Date(); await season.save();
      const bites = new EmbedBuilder().setTitle('⏳ KILLER QUEEN: BITES THE DUST!').setImage(BITES_THE_DUST_GIF).setColor(0xFF0000);
      return message.channel.send({ embeds: [bites] });
    }

    // Gestão de Fama Manual
    if (content.startsWith('!addfama') || content.startsWith('!remfama')) {
        const target = message.mentions.users.first();
        const amt = parseInt(args[2]);
        if (!target || isNaN(amt)) return message.reply("Use: `!addfama @user valor`.");
        let user = await User.findOne({ userId: target.id }) || new User({ userId: target.id });
        user.fama = content.startsWith('!add') ? user.fama + amt : Math.max(0, user.fama - amt);
        await user.save();
        return message.reply(`⭐ Fama de ${target} atualizada: **${user.fama}**`);
    }

    // Forçar Fim de Season (Gera prêmios e vai para a próxima)
    if (content === '!fimseason') {
        let season = await Season.findOne() || new Season({ seasonNumber: 1 });
        await sendSeasonEmbed(message.channel, season.seasonNumber);
        await User.updateMany({}, { fama: 0 });
        season.start = new Date(); season.seasonNumber += 1; await season.save();
        return message.reply('✅ Temporada finalizada e prêmios entregues!');
    }
  }

  // 3. Comandos do Ranking (Restritos ao Canal Configurado)
  const guildConfig = await Guild.findOne({ guildId: message.guild.id });
  if (!guildConfig || message.channel.id !== guildConfig.hallChannelId) return;

  if (content === '!ranking') {
    const top = await User.find({ fama: { $gt: 0 } }).sort({ fama: -1 }).limit(10);
    const rankEmbed = new EmbedBuilder()
      .setTitle('🏆 RANKING DE FAMA')
      .setColor(0xF1C40F)
      .setThumbnail(RANKING_BANNER)
      .setDescription(top.map((u, i) => `${i < 3 ? ['🥇','🥈','🥉'][i] : `**${i+1}º**`} <@${u.userId}> — ⭐ **${u.fama}**`).join('\n') || "Ainda não há ninguém no ranking.");
    return message.reply({ embeds: [rankEmbed] });
  }

  if (content === '!fama') {
    const user = await User.findOne({ userId: message.author.id });
    message.reply(`⭐ Sua fama: **${user ? user.fama : 0}**`);
  }
});

client.login(process.env.TOKEN);