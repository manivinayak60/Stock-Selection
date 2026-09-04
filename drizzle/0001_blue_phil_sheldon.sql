CREATE INDEX `idx_paper_trades_user_status` ON `paper_trades` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_scan_runs_user_created` ON `scan_runs` (`user_id`,`created_at`);