CREATE VIRTUAL TABLE FoodSearch USING fts5(searchText,content='Food',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2',prefix='2 3');
CREATE TRIGGER food_search_insert AFTER INSERT ON Food BEGIN
  INSERT INTO FoodSearch(rowid,searchText) VALUES (NEW.rowid,NEW.searchText);
END;
CREATE TRIGGER food_search_delete AFTER DELETE ON Food BEGIN
  INSERT INTO FoodSearch(FoodSearch,rowid,searchText) VALUES ('delete',OLD.rowid,OLD.searchText);
END;
CREATE TRIGGER food_search_update AFTER UPDATE OF searchText ON Food WHEN OLD.searchText IS NOT NEW.searchText BEGIN
  INSERT INTO FoodSearch(FoodSearch,rowid,searchText) VALUES ('delete',OLD.rowid,OLD.searchText);
  INSERT INTO FoodSearch(rowid,searchText) VALUES (NEW.rowid,NEW.searchText);
END;
INSERT INTO FoodSearch(FoodSearch) VALUES ('rebuild');

CREATE VIRTUAL TABLE ExerciseSearch USING fts5(searchText,content='Exercise',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2',prefix='2 3');
CREATE TRIGGER exercise_search_insert AFTER INSERT ON Exercise BEGIN
  INSERT INTO ExerciseSearch(rowid,searchText) VALUES (NEW.rowid,NEW.searchText);
END;
CREATE TRIGGER exercise_search_delete AFTER DELETE ON Exercise BEGIN
  INSERT INTO ExerciseSearch(ExerciseSearch,rowid,searchText) VALUES ('delete',OLD.rowid,OLD.searchText);
END;
CREATE TRIGGER exercise_search_update AFTER UPDATE OF searchText ON Exercise WHEN OLD.searchText IS NOT NEW.searchText BEGIN
  INSERT INTO ExerciseSearch(ExerciseSearch,rowid,searchText) VALUES ('delete',OLD.rowid,OLD.searchText);
  INSERT INTO ExerciseSearch(rowid,searchText) VALUES (NEW.rowid,NEW.searchText);
END;
INSERT INTO ExerciseSearch(ExerciseSearch) VALUES ('rebuild');
