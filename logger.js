const winston = require('winston');

const { combine, timestamp, errors, splat, json, prettyPrint, simple, label, printf, colorize} = winston.format;

const custom_log_format = printf(({label, timestamp, level, message}) => {
    return `[${timestamp}] - [${label}] - [${level.toUpperCase()}] : ${message}`;
});

const test_log_format = printf(({label, message}) => {
    return `[${label}] : ${message}`;
});

const global_logger = winston.createLogger({
    format: combine(
        timestamp( {format: "HH:mm:ss"}),
        label({ label: "BINANCE BOT" }),
        errors({ stack: true }),
        splat(),
        prettyPrint(),
        custom_log_format
    ),
    transports: [
        new winston.transports.Console(),
    ],
    exceptionHandlers : [
        new winston.transports.Console(),
    ],
    exitOnError : false
});

const test_logger = (symbol)  => winston.createLogger({
    format: combine(
        label({ label: "TEST - " + symbol }),
        splat(),
        prettyPrint(),
        test_log_format
    ),
    transports: [
        new winston.transports.File({ dirname: "logs/test_all", filename: symbol + ".log" }) 
    ],
    exceptionHandlers : [
        new winston.transports.Console(),
    ],
    exitOnError : false
});

const add_logger = (category, log_directory="logs") => {
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
        exceptionHandlers : [
            new winston.transports.Console(),
        ],
        exitOnError : false
    });
}

const get_logger = (category) => winston.loggers.get(category);

exports.global_logger = global_logger;
exports.test_logger = test_logger;
exports.add_logger = add_logger;
exports.get_logger = get_logger;
