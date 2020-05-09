import {Request, Response} from "express";
import {ICrawlTask, TaskHandler} from "../models/crawltask.model";

export async function getTaskById(req: Request, res: Response, task_handler?: TaskHandler): Promise<ICrawlTask | null> {
  if (!task_handler) {
    task_handler = new TaskHandler();
  }

  let task_id = req.body.id;
  if (!task_id) {
    task_id = req.params.id;
  }
  if (!task_id) {
    task_id = req.query.id;
  }

  let task = null;

  try {
    task =  await task_handler.task_model.findById(task_id);
  } catch (err) {
    res.status(400).send({error: `could not get task: ${err}`});
  }

  return task;
}