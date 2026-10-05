-- Accounts, sessions, synced browser data and login throttling.
CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  last_login_at DATETIME NULL,
  UNIQUE KEY users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  UNIQUE KEY sessions_token (token_hash),
  KEY sessions_expiry (expires_at),
  CONSTRAINT sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_data (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  data LONGTEXT NOT NULL,
  version INT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT user_data_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  email VARCHAR(254) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  attempted_at DATETIME NOT NULL,
  KEY attempts_ip (ip, kind, attempted_at),
  KEY attempts_email (email, kind, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
