const rateLimit = () => {
    // Simple delay to prevent too many requests
    return new Promise(resolve => setTimeout(resolve, 1000));
};

module.exports = { rateLimit }; 