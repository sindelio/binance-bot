const winston = require('winston');

exports.logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp( {format: "YYYY-MM-DD HH:mm:ss"}),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
        winston.format.prettyPrint()
    ),
    transports: [
        new winston.transports.File({ filename: "error.log", level: "error" }),
        new winston.transports.File({ filename: "quick-start-combined.log" }) 
    ]
});