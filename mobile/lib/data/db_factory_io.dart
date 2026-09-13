import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// Native platforms use the default sqflite factory; nothing to configure.
void initDatabaseFactory() {}

Future<String> defaultDatabasePath(String fileName) async {
  if (Platform.environment.containsKey('FLUTTER_TEST')) {
    return inMemoryDatabasePath;
  }
  return p.join(await getDatabasesPath(), fileName);
}
