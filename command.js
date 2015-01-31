var fs = require('fs');
var net = require('net');
var path = require('path');
var CONST = require('./config/const');

function command() {

}

command.user = function(so, args) {
	so.app.user = args;
	so.write('331 Please specify the password.\r\n');
};

command.pass = function(so, args) {
	so.app.pass = args;
	so.write('230 Login successful.\r\n');
};

command.syst = function(so, args) {
	so.write('215 Unix cj\r\n');
};

command.feat = function(so, args) {
	so.write('211-Feature:\n211 End\r\n');
};

command.clnt = function(so, args) {
	so.app.cli = args;
	so.write('200 OK i know.\r\n');
};

command.pwd = function(so, args) {
	so.write('257 "' + so.app.cwd + '"\r\n');
};

command.rest = function(so, args) {
	so.app.rest = args;
	so.write('350 Restart position accepted (' + args + ').\r\n');
};

command.type = function(so, args) {
	var mode = 'binary';
	if ('A' === args) {
		console.log('transfer buffer type');
		so.type = 'ASCII';
	} else if('B' === args) {
		console.log('transfer buffer type');
		so.type = 'BINARY';
	}
	so.write('200 Switch to ' + mode + ' OK\r\n');
};

command.cwd = function(so, dir) {
	if (dir[0] === '/') {
		so.app.cwd = dir;
	} else {
		so.app.cwd = path.join(so.app.cwd, dir);
	}
	so.write('250 Directry successfully changed.\r\n');
};

command.cdup = function(so) {
	so.app.cwd = path.join(so.app.cwd, '..');
	so.write('250 Directry successfully changed.\r\n');
};

command.pasv = function(so, args) {
	if (!so.app.dil) {
		so.app.dil = net.createServer(function(conn) {
			so.app.di = conn;
		}).on('error', function(e) {
			console.log(e);
		}).listen(so.app.config.data_port);
	}
	var port = parseInt(so.app.config.data_port);
	var hl = (port >> 8) & 0xFF;
	var lo = (port & 0xFF);
	var addr = '127,0,0,1,' + hl + ',' + lo;
	so.write('227 Entering Passive Mode (' + addr + ')\r\n');
};

command.list = function(so, args) {
	if (!so.app.di) {
		console.log('error di no exsit');
		return;
	}

	so.write('150 Here comes the directory listing.\r\n');
	// list directory
	var fileList = getFileList(path.join(so.app.vroot, so.app.cwd), '');
	// end list directory
	so.app.di.write(fileList, function(err) {
		if (!err) {
			so.app.di.end();
			so.write('226 Directory send OK.\r\n');
		} else {
			// ??
		}
	});
};

command.retr = function(so, filename) {
	var src = path.join(so.app.vroot, so.app.cwd, filename);
	console.log('src:', src);
	try {
		var size = fs.lstatSync(src).size;
		console.log('size:', size);
		so.write('150 Opening BINARY mode data connection for ' +
			src + '(' + size + ' bytes)\r\n');
	} catch (err) {
		console.log('err', err);
	}

	var server = so.app.dil;
	server.on('connection', function(conn) {
		var record = conn.remoteAddress + ':' + conn.remotePort;
		console.log('[dil] Connected: ', record);
		
		var fin = fs.createReadStream(src);
		so.on('drain', function() {
			fin.resume();
		});
		fin.on('data', function(data) {
			if (!conn.write(data)) {
				fin.pause();
			}
		}).on('end', function() {
			so.write('226 Transfer complete.\r\n');
			if (!!conn) {
				conn.end();
			}
		});
	})
};

command.stor = function(so, args) {
	so.write('150 OK to send data.\r\n');
	var fout = fs.createWriteStream(path.join(so.app.vroot, args));
	fout.on('drain', function() {
		if (so.app.di)
			so.app.di.resume();
	});
	so.app.di.on('data', function(data) {
		if (!fout.write(data)) {
			so.app.di.pause();
		}
	}).on('end', function() {
		so.app.di.end();
		so.app.di = null;
		so.write('226 Transfer complete.\r\n');
	}).on('error', function(e) {
		console.log(e);
	});
};

command.dele = function(so, args) {
	//so.write();
	fs.unlink(path.join(so.app.vroot, args), function(err) {
		if (!err) {
			so.write('250 Delete operation successful.\r\n');
		}
	});
};

command.mkd = function(so, args) {
	fs.mkdir(path.join(so.app.vroot, args), function(err) {
		if (!err) {
			so.write('257 ' + args + ' created.\r\n');
		}
	});
};

command.noop = function(so, args) {
	so.write('200 Noop OK\r\n');
};

command.unknown = function(so, args) {
	so.write('500 Unknown command\r\n');
};

module.exports = command;

var getFileList = function(dir) {
	console.log('listing directory :' + dir);
	var line = '';
	var stat;
	fs.readdirSync(dir).forEach(function(f) {
		try {
			stat = fs.lstatSync(path.join(dir, f));
		} catch (e) {
			console.log('getFileList error:' + e);
			return;
		}

		// file type
		if (stat.isFile()) {
			line += '-';
		} else if (stat.isDirectory()) {
			line += 'd';
		} else if (stat.isBlockDevice()) {
			line += 'b';
		} else if (stat.isCharacterDevice()) {
			line += 'c';
		} else if (stat.isSymbolicLink()) {
			line += 'l';
		} else if (stat.isFIFO()) {
			line += 'f';
		} else if (stat.isSocket()) {
			line += 's';
		}

		// file mode
		line += CONST.MASK[stat.mode >> 16 & 0xF];
		line += CONST.MASK[stat.mode >> 8 & 0xF];
		line += CONST.MASK[stat.mode & 0xF];
		line += ' ';

		// node link
		line += stat.nlink + ' ';

		// user, group
		line += stat.uid + ' ' + stat.gid + ' ';

		// size
		line += stat.size + ' ';

		// datetime 
		line += getTimeString(stat.mtime);

		// filename
		line += f + '\n';
	});
	// console.log('line:', line);
	return new Buffer(line);
};

var getTimeString = function(time) {
	var result = CONST.MONTH[time.getMonth()] + ' ' + time.getDay() + ' ';
	result += time.getHours() + ':' + time.getMinutes() + ' ';
	return result;
};