module.exports = {
  PORT: process.env.PORT || 8000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_ORIGIN:
    process.env.NODE_ENV === 'production'
      ? process.env.CLIENT_ORIGIN
      : 'http://localhost:3000',
  DATABASE_URL:
    process.env.DATABASE_URL || 'postgresql://dunder_mifflin@localhost/anonygram',
  AWS_ID: process.env.AWS_ID,
  AWS_SECRET: process.env.AWS_SECRET,
  AWS_BUCKET: process.env.AWS_BUCKET
};
