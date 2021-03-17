const winston = require('winston');

const { combine, timestamp, errors, splat, json, prettyPrint, simple, label, printf, colorize} = winston.format;

const custom_log_format = printf(({label="", timestamp, level, message}) => {
    return `[${timestamp}] - [${label}] - [${level.toUpperCase()}] : ${message}`;
});

const global_logger = winston.createLogger({
    format: combine(
        timestamp( {format: "HH:mm:ss"}),
        label({ label: "BINANCE" }),
        errors({ stack: true }),
        splat(),
        prettyPrint(),
        custom_log_format
    ),
    transports: [
        new winston.transports.Console(),
    ],
});

const add_logger = (category, log_directory="./logs") => {
    return winston.loggers.add(category, {
        format: combine(
            timestamp( {format: "MM-DD HH:mm:ss"}),
            label({ label: category }),
            errors({ stack: true }),
            splat(),
            json(),
            prettyPrint(),
            custom_log_format
        ),
        transports: [
            new winston.transports.File({ dirname: log_directory, filename: category + ".log" }) 
        ],
    });
}

const get_logger = (category) => winston.loggers.get(category);

exports.global_logger = global_logger;
exports.add_logger = add_logger;
exports.get_logger = get_logger;
