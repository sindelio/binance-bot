const winston = require('winston');

const { combine, timestamp, errors, splat, json, prettyPrint, simple, label, printf } = winston.format;

const custom_log_format = printf(({ level, message, label="", timestamp }) => {
    return `[${timestamp}] - [${label}] - [${level.toUpperCase()}] : ${message}`;
});

const create_logger = (log_directory="./logs", filename_prefix="") => {
    const logger = winston.createLogger({
        format: combine(
            timestamp( {format: "MM-DD HH:mm:ss"}),
            errors({ stack: true }),
            splat(),
            json(),
            prettyPrint(),
            custom_log_format,
        ),
        transports: [
            new winston.transports.File({ dirname: log_directory, filename: filename_prefix + ".log" }) 
        ]
    });

    return logger;
}


exports.create_logger = create_logger;
