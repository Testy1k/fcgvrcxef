const Discord = require('discord.js');
const fs = require('fs');
const express = require('express');

const app = express();

const port = 3000;
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('vouches.db', (err) => {
    if (err) {
        console.error('Error connecting to SQLite3 database:', err.message);
    } else {
        console.log('Connected to SQLite3 database');

        // Create vouches table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS vouches (
            user_id TEXT PRIMARY KEY,
            vouches INTEGER DEFAULT 0,
            negvouches INTEGER DEFAULT 0,
            reasons TEXT DEFAULT '[]',
            todayvouches INTEGER DEFAULT 0,
            last3daysvouches INTEGER DEFAULT 0,
            lastweekvouches INTEGER DEFAULT 0
        )`);
    }
});



app.get('/', (req, res) => res.send('Online Yo boi!'));
app.listen(port, () => console.log('Server is listening on port ' + port));

const client = new Discord.Client();
client.commands = new Discord.Collection();

const config = require('./config.json');
const token = config.token;

const commandFolders = fs.readdirSync('./commands');

for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(`./commands/${folder}/${file}`);

        let prefix;
        if (folder === 'generator') {
            prefix = config.genPrefix;
        } else if (folder === 'help') {
            prefix = config.helpPrefix;
        } else if (folder === 'vouch') {
            prefix = config.vouchPrefix;
        } else if (folder === 'negvouch') {
            prefix = config.negVouchPrefix;
        } else {
            prefix = config.prefix;
        }

        command.prefix = prefix;

        console.log(`Loaded command: ${prefix}${command.name} `);
        client.commands.set(command.name, command);
    }
}

// Function to check if a channel or role exists in the server
function validateServerConfig() {
    const guilds = client.guilds.cache.array();

    for (const guild of guilds) {
        console.log(`Checking server: ${guild.name} (${guild.id})`);

        // Check if notification channel exists
        const notificationChannel = guild.channels.cache.get(config.notificationChannelId);
        if (!notificationChannel) {
            console.error(`Warning: Notification channel not found in server ${guild.name} (${guild.id}). Check your config.json.`);
        }

        // Check if specified roles exist
        const specifiedRoles = config.specifiedRoleIds || [];
        for (const roleId of specifiedRoles) {
            const role = guild.roles.cache.get(roleId);
            if (!role) {
                console.error(`Warning: Specified role with ID ${roleId} not found in server ${guild.name} (${guild.id}). Check your config.json.`);
            }
        }
    }
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity(`${config.helpPrefix}help │ 𝗡𝗘𝗫𝗨𝗦 𝗚𝟯𝗡`);

    // Check server configurations on bot start
    validateServerConfig();
});

client.on('message', (message) => {
    if (message.author.bot) return; // Ignore messages from bots

    const prefixes = [
        config.vouchPrefix,
        config.negVouchPrefix,
        config.genPrefix,
        config.helpPrefix
    ];

    let usedPrefix = null;

    for (const prefix of prefixes) {
        if (message.content.startsWith(prefix)) {
            usedPrefix = prefix;
            break;
        }
    }

    if (!usedPrefix) return; // If no valid prefix is found, ignore the message

    const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        if (config.command.notfound_message === true && !client.commands.has(command)) {
            return message.channel.send(
                new Discord.MessageEmbed()
                    .setColor(config.color.red)
                    .setTitle('Unknown command :(')
                    .setDescription(`Sorry, but I cannot find the \`${command}\` command!`)
                    .setFooter(message.author.tag, message.author.displayAvatarURL({ dynamic: true, size: 64 }))
                    .setTimestamp()
            );
        }

        // Execute the command
        client.commands.get(command).execute(message, args, usedPrefix, config.vouchPrefix);
    } catch (error) {
        console.error(error);
    }
});


const webhookLogFile = 'verified.txt';
const designatedChannelId = '1197803003625877535';

client.on('message', (message) => {
  if (message.webhookID && message.channel.id === designatedChannelId) {
    fs.appendFileSync(webhookLogFile, `${message.content}\n`);

    
  }

if (!message.content.startsWith(config.prefix)) return;
  if (message.author.bot) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
      client.commands.get(command).execute(message, args, config.prefix, config.vouchPrefix, vouches);
  } catch (error) {
      console.error(error);
  }
});





client.on('message', (message) => {
    if (message.author.bot || message.channel.id !== config.vouchChannelId) {
        return;
    }

    const content = message.content.toLowerCase();
    const mentions = message.mentions.members;

    if (content.startsWith(config.vouchPrefix) && mentions.size === 1) {
        const vouchKey = `${message.author.id}_${mentions.first().id}`;

        // Retrieve vouch count from the database
        db.get('SELECT vouches FROM vouches WHERE user_id = ?', [vouchKey], (err, row) => {
            if (err) {
                console.error(`Error retrieving vouch count: ${err.message}`);
                return;
            }

            const vouchCount = row ? row.vouches : 0;

            // Check and assign auto role
            checkAutoRole(message, vouchCount);

            if (vouchCount >= 9) {
                // Report to logs channel
                const logsChannel = client.channels.cache.get(config.logsChannelId);

                if (logsChannel instanceof Discord.TextChannel) {
                    logsChannel.send({
                        embed: {
                            color: 0xFF0000,
                            title: 'Potential Vouch Spam Detected!',
                            description: `User ${message.author.tag} may be vouch spamming ${mentions.first().user.tag}.`,
                            fields: [
                                {
                                    name: 'Messages',
                                    value: `User sent similar vouch messages ${vouchCount + 1} times.`,
                                },
                                {
                                    name: 'Content',
                                    value: message.content,
                                },
                            ],
                            timestamp: new Date(),
                        },
                    });
                }
            } else {
                // Update vouch count in the database
                db.run('UPDATE vouches SET vouches = ? WHERE user_id = ?', [vouchCount + 1, vouchKey], (err) => {
                    if (err) {
                        console.error(`Error updating vouch count: ${err.message}`);
                    }
                });
            }
        });
    }
});



client.login(token);