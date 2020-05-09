import {Request, Response, NextFunction} from "express";

export function auth(req: Request, res: Response, next: NextFunction) {
  let api_key = req.body['API_KEY'] || req.query['API_KEY'] || req.headers['X-Api-Key'] ||
    req.body['KEY'] || req.query['KEY'];

  if (!api_key) {
    return res.status(401).send({error: 'Access denied. No key `API_KEY/KEY` provided.'});
  }

  if (api_key === process.env.API_KEY) {
    return next();
  } else {
    return res.status(401).send({error: `Access denied. Invalid API_KEY/KEY`});
  }
}

/**
 * Asserts that a certain route was provided with an api key.
 *
 * Don't use that to protect from unauthenticated clients.
 *
 * @param req
 * @param res
 * @param next
 */
export function api_key_given(req: Request, res: Response, next: NextFunction) {
  let api_key = req.body['API_KEY'] || req.query['API_KEY'] || req.headers['X-Api-Key'] ||
    req.body['KEY'] || req.query['KEY'];

  if (!api_key) {
    return res.status(401).send({error: 'Access denied. No key `API_KEY/KEY` provided.'});
  } else {
    res.locals.api_key = api_key;
    return next();
  }
}