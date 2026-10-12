import jwt from 'jsonwebtoken';

function secret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('Missing JWT_SECRET.');
  }
  return process.env.JWT_SECRET;
}

export function signToken(user, channel) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, channel },
    secret(),
    { expiresIn: '8h' }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Log in first.' });
    return;
  }
  try {
    req.user = jwt.verify(token, secret());
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Log in again.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Your role cannot do that.' });
      return;
    }
    next();
  };
}

export function blockAtm(req, res, next) {
  if (req.user.channel === 'atm') {
    res.status(403).json({ error: 'An ATM cannot do that. Log in through the branch instead.' });
    return;
  }
  next();
}
