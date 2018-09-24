const Discord = require("discord.js");
const sql = require("sqlite");
const winston = require("winston");
const fs = require("fs");
const execSync = require("child_process").execSync;
const config = require("./config.json");
const responses = require("./responses.json");

if (!fs.existsSync(config.logDirectory)) {
	fs.mkdirSync(config.logDirectory);
}
const { combine, timestamp, printf } = winston.format;
const myFormat = printf(info => {
	return `${info.timestamp} ${info.message}`;
});
const logger = winston.createLogger({
	format: combine(
		timestamp(),
		myFormat
	),
	transports: [
		new (winston.transports.Console)({
			level: "info"
		}),
		new (winston.transports.File)({
			filename: `${config.logDirectory}/${config.logFilename}`,
			level: "info"
		})
	]
});

function handleGet(message, command) {
	const secondParameter = command[2];
	if (!secondParameter) {
		message.reply(responses.whatGet);
		return;
	}
	logger.info(`GET! Username->${message.author.username} AuthorID->${message.author.id} ItemName->${secondParameter}`);

	sql.get(`SELECT * FROM commands WHERE name="${secondParameter}"`).then(row => {
		if (!row) {
			message.reply(responses.couldntGet);
		} else {
			message.reply(row.source);
		}
	});
}

function handleCreate(message, command) {
	const itemName = command[2];
	if (!itemName) {
		message.reply(responses.provideNameAndUrl);
		return;
	}
	if (itemName === "name") {
		message.reply(responses.badInput);
		return;
	}
	const source = command[3];
	if (!source) {
		message.reply(responses.provideUrl);
		return;
	}
	const author = message.author.id;

	sql.get(`SELECT * FROM commands WHERE name="${itemName}"`).then(row => {
		if (!row) {
			sql.run("INSERT INTO commands (userID,name,source) VALUES (?,?,?)", [author, itemName, source]);
			logger.info(`CREATE! Username->${message.author.username} AuthorID->${author} ItemName->${itemName} Source->${source}`);
			message.reply(`${responses.createSuccess} ${itemName}!`);
			return;
		} else {
			message.reply(responses.existingItem);
			return;
		}
	});
}

function handleDelete(message, command) {

	const itemName = command[2];
	if (!itemName) {
		message.reply(responses.provideName);
		return;
	}
	if (itemName === "name") {
		message.reply(responses.badInput);
		return;
	}

	sql.get(`SELECT * FROM commands WHERE name="${itemName}"`).then(row => {
		if (!row) {
			message.reply(responses.couldntGet);
		} else if (message.author.id === row.userID || message.member.roles.some(r => ["Administrator", "moderator"].includes(r.name))) {
			sql.run(`DELETE FROM commands WHERE name="${itemName}"`);
			logger.info(`DELETE! Username->${message.author.username} AuthorID->${message.author.id} ItemName->${itemName}`);
			message.reply(`${responses.deleteSuccess} ${itemName}!`);
		} else {
			message.reply(responses.noPermissionsDelete);
		}
	});
}

function handleHelp(message, command) {
	logger.info(`HELP! Username->${message.author.username} AuthorID->${message.author.id}`);

	if (command[2]) {
		switch (command[2]) {
		case "get":
			message.reply(responses.helpGet);
			break;
		case "help":
			message.reply(responses.helpHelp);
			break;
		case "create":
			message.reply(responses.helpCreate);
			break;
		case "delete":
			message.reply(responses.helpDelete);
			break;
		case "edit":
			message.reply(responses.helpEdit);
			break;
		case "random":
			message.reply(responses.helpRandom);
			break;
		case "items":
			message.reply(responses.helpItems);
			break;
		default:
			message.reply(responses.helpDefault);
			break;
		}
	} else {
		message.reply(responses.help);
	}
}

function handleEdit(message, command) {
	const itemName = command[2];
	if (!itemName) {
		message.reply(responses.provideNameAndUrl);
		return;
	}
	const source = command[3];
	if (!source) {
		message.reply(responses.provideUrl);
		return;
	}

	sql.get(`SELECT * FROM commands WHERE name="${itemName}"`).then(row => {
		if (!row) {
			message.reply(responses.couldntGet);
		} else if (message.author.id === row.userID || message.member.roles.some(r => ["Administrator", "moderator"].includes(r.name))) {
			sql.run(`UPDATE commands SET source="${source}" WHERE name="${itemName}"`);
			logger.info(`EDIT! Username->${message.author.username} AuthorID->${message.author.id} NewItemName->${itemName}`);
			message.reply(`${responses.editSuccess} ${itemName}!`);
		} else {
			message.reply(responses.editNoPermissions);
		}
	});
}

function handleItems(message) {
	logger.info(`COMMANDS! Username->${message.author.username} AuthorID->${message.author.id}`);

	let cmds = responses.items;

	sql.all("SELECT * FROM commands").then(rows => {
		if (rows.length === 0) {
			message.reply(responses.noItems);
		} else {
			rows.forEach(row => {
				cmds += row.name + "\n";
			});
			message.reply(cmds);
		}
	});
}

function handleRandom(message) {
	logger.info(`RANDOM! Username->${message.author.username} AuthorID->${message.author.id}`);

	sql.all("SELECT * FROM commands").then(rows => {
		if (rows.length === 0) {message.reply(responses.noItems);}
		else {
			let numberOfItems = rows.length;
			const rand = Math.floor(Math.random() * numberOfItems);
			message.reply(responses.random + rows[rand].source);
		}});
}


const client = new Discord.Client();

client.on("ready", () => {
	logger.info("GEORG LOGGED IN!");
});

client.on("message", message => {
	if (message.author.bot || message.channel.type === "dm") return;
	if (message.content.substring(0, 5).toLowerCase() === "georg") {
		const command = message.content.split(" ");
		const firstParameter = command[1];

		switch (firstParameter) {
		case "get":
			handleGet(message, command);
			break;
		case "create":
			handleCreate(message, command);
			break;
		case "delete":
			handleDelete(message, command);
			break;
		case "help":
			handleHelp(message, command);
			break;
		case "edit":
			handleEdit(message, command);
			break;
		case "items":
			handleItems(message);
			break;
		case "random":
			handleRandom(message);
			break;
		}
	}
});
client.on("error", (error) => logger.info(error));
client.on("reconnecting", () => logger.info("RECONNECTING"));


function launchBot(){
	client.login(config.token)
		.then(() => {
			// 3 hours
			client.setTimeout(backup, config.backupInterval);
		})
		.catch((reason) => {
			logger.info(reason);
			logger.info("Trying again in 10 seconds");
			setTimeout(launchBot, 10000);
		});
}

function backup(){
	client.destroy();
	try {
		logger.info(execSync("sh backup.sh").toString());
	} catch(e){
		logger.info("ERROR: " + e);
	}
	setTimeout(launchBot,1000);
}

sql.open("./commands.sqlite");
launchBot();
