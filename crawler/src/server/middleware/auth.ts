import {Request, Response, NextFunction} from "express";

export function auth(req: Request, res: Response, next: NextFunction) {
  let API_KEY = process.env.API_KEY;

  if (!API_KEY) {
    return res.status(401).send('Access denied. Server without `API_KEY` started.');
  }

  if (!req.body.API_KEY && !req.query.API_KEY && !req.headers['X-Api-Key']) {
    return res.status(401).send('Access denied. No key `API_KEY` provided.');
  }

  if (isAuthenticated(req)) {
    next();
  } else {
    return res.status(401).send({error: `Access denied. Invalid API_KEY`});
  }
}

export function isAuthenticated(req: Request): boolean {
  let API_KEY = process.env.API_KEY;
  return req.body.API_KEY === API_KEY || req.query.API_KEY === API_KEY || req.headers['X-Api-Key'] === API_KEY;
}