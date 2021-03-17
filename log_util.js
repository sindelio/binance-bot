const winston = require('winston');

const create_logger = (log_directory=".", filename_prefix="") => {
    const logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp( {format: "MM-DD HH:mm:ss"}),
            winston.format.errors({ stack: true }),
            winston.format.splat(),
            winston.format.json(),
            winston.format.prettyPrint()
        ),
        transports: [
            new winston.transports.File({ dirname: log_directory, filename: filename_prefix + "_error.log", level: "error" }),
            new winston.transports.File({ dirname: log_directory, filename: filename_prefix + "_info.log" }) 
        ]
    });

    return logger;
}


exports.create_logger = create_logger;
