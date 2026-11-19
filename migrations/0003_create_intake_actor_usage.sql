CREATE TABLE intake_actor_usage (
  actor TEXT NOT NULL,
  day TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  batches INTEGER NOT NULL,
  PRIMARY KEY (actor, day)
);
