CREATE TABLE ttt_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  room_id INTEGER NOT NULL,
  player_x_id INTEGER,
  player_o_id INTEGER,
  winner_id INTEGER,
  result TEXT DEFAULT NULL,
  elo_change_x INTEGER DEFAULT 0, 
  elo_change_o INTEGER DEFAULT 0,
  FOREIGN KEY (player_x_id) REFERENCES users(id),
  FOREIGN KEY (player_o_id) REFERENCES users(id),
  FOREIGN KEY (winner_id) REFERENCES users(id)
);

CREATE TABLE chess_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  room_id INTEGER NOT NULL,
  player_white_id INTEGER,
  player_black_id INTEGER,
  winner_id INTEGER,
  result TEXT DEFAULT NULL,
  elo_change_white INTEGER DEFAULT 0, 
  elo_change_black INTEGER DEFAULT 0,
  FOREIGN KEY (player_white_id) REFERENCES users(id),
  FOREIGN KEY (player_black_id) REFERENCES users(id),
  FOREIGN KEY (winner_id) REFERENCES users(id)
);

CREATE TABLE bingo_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  room_id INTEGER NOT NULL,
  player_1_id INTEGER,
  player_2_id INTEGER,
  winner_id INTEGER,
  result TEXT DEFAULT NULL,
  elo_change_1 INTEGER DEFAULT 0, 
  elo_change_2 INTEGER DEFAULT 0,
  FOREIGN KEY (player_1_id) REFERENCES users(id),
  FOREIGN KEY (player_2_id) REFERENCES users(id),
  FOREIGN KEY (winner_id) REFERENCES users(id)
);