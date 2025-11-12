---
category:
  - MySQL
  - PostgresSQL
  - SQL优化
tag:
  - 数据库
date: 2025-11-12
star: false
---

# SQL优化

## 1. using filesort

可以对排序的字段添加相应顺序的索引，来避免 `using filesort`。

## 2. using temporary

常发生在执行包含排序（`GROUP BY`, `ORDER BY`）、去重（`DISTINCT`）或联合（`UNION`）等操作的查询时。当 MySQL
在执行查询时，无法直接通过索引获得所需的有序结果，它就需要创建一个内部临时表来存储中间结果，以便进行后续的操作（如排序、分组、去重等）。

优化 `Using temporary` 的核心思想是：让 MySQL 能够利用索引来直接完成排序和分组，从而避免创建临时表。

- 方法 1：为 `GROUP BY` 和 `ORDER BY` 字段创建索引
- 方法 2：减少查询字段，避免 `SELECT *`，如果临时表是因为要处理的数据量过大（例如，包含了 `TEXT` 或 `BLOB` 列）而被写入磁盘，那么减少查询的列数可以显著减小临时表的大小。

**示例：**

```sql
-- 假设在 user_id 和 create_time 上没有合适的索引
SELECT user_id, COUNT(*)
FROM orders
GROUP BY user_id;
SELECT *
FROM articles
ORDER BY create_time DESC;
```

这两个查询很可能都会产生 `Using temporary`。

**优化：**

```sql
-- 为 GROUP BY 的列创建索引
ALTER TABLE orders ADD INDEX idx_user_id (user_id);

-- 对于 ORDER BY，创建对应列的索引
ALTER TABLE articles ADD INDEX idx_create_time (create_time);
```

**特殊情况：联合索引**
如果查询中包含了 `WHERE` 条件、`GROUP BY` 和 `ORDER BY`，需要创建更精细的联合索引。
```sql
SELECT category, COUNT(*)
FROM products
WHERE status = 'active'
GROUP BY category;
```

这个查询会先根据 `WHERE status = 'active'` 过滤，然后对结果集进行 `GROUP BY`，可能产生临时表。

**优化：**

```sql
-- 创建一个覆盖了 WHERE 和 GROUP BY 的联合索引
ALTER TABLE products ADD INDEX idx_status_category (status, category);
```

这个索引的结构使得所有 `status = 'active'` 的数据在物理上是连续存储的，并且 `category` 也是有序的。MySQL可以按顺序扫描索引，直接完成分组，无需临时表。

**利用索引避免 ORDER BY**
```sql
SELECT * FROM users ORDER BY last_login DESC LIMIT 10;
```

**优化：**

```sql
-- 为 last_login 创建降序索引 (MySQL 8.0+ 支持降序索引)
ALTER TABLE users ADD INDEX idx_last_login_desc (last_login DESC);
-- 或者对于旧版本，普通索引也可以，但优化器会选择反向扫描
ALTER TABLE users ADD INDEX idx_last_login (last_login);
```
有了索引后，MySQL 可以直接从索引的“末端”开始读取，快速找到最近登录的10个用户，而无需对整个结果集排序。

**join查询**
```sql
SELECT t1.name, COUNT(*)
FROM table1 t1
JOIN table2 t2 ON t1.id = t2.t1_id
GROUP BY t1.name;
```

**优化：**

```sql
-- 确保连接字段和分组字段上有索引
ALTER TABLE table2 ADD INDEX idx_t1_id (t1_id);
ALTER TABLE table1 ADD INDEX idx_name (name);
```

## 3. using where

## 3. using where

表明查询使用了 `WHERE` 子句进行条件过滤。一般在没有使用到索引的时候会出现。

## 4. 驱动表优化

通过 SQL 执行计划查看驱动表（MySQL 中排前面的是驱动表），在驱动表中的 `WHERE` 条件上添加索引，以避免全表扫描驱动表。

## 5. 建立联合索引，利用覆盖索引，避免回表查询

当一个索引包含了（或者说“覆盖了”）某个查询所需要的所有字段时，这个索引就称为覆盖索引。这意味着，数据库引擎只需要扫描索引本身就可以获取全部所需数据，而无需再回表去查询主表（数据表）的数据行。

## 6. 建立联合索引，利用索引下推

在 MySQL 中，可以通过 `EXPLAIN` 语句来查看查询执行计划。如果 `Extra` 列中出现了 `Using index condition`，就表示这个查询使用了索引下推。

索引下推，也常被称为 ICP（Index Condition Pushdown），是数据库优化器在处理查询时的一种技术。它的核心思想是：在遍历索引的过程中，尽可能早地对索引中包含的字段进行`WHERE` 条件过滤，而不是等到回表之后再去过滤。

```sql
SELECT * FROM users WHERE name LIKE 'A%' AND age = 25;
```
在 (name, age) 上建立了一个联合索引 idx_name_age。

```text
+----+-------------+-------+------------+-------+---------------+--------------+---------+------+------+----------+-----------------------+
| id | select_type | table | partitions | type  | possible_keys | key          | key_len | ref  | rows | filtered | Extra                 |
+----+-------------+-------+------------+-------+---------------+--------------+---------+------+------+----------+-----------------------+
|  1 | SIMPLE      | users | NULL       | range | idx_name_age  | idx_name_age | 154     | NULL |    3 |    33.33 | Using index condition |
+----+-------------+-------+------------+-------+---------------+--------------+---------+------+------+----------+-----------------------+
```

**适用情况**

- **只能用于二级索引（非主键索引）**：因为主键索引（聚簇索引）的叶子节点就是数据行本身，不存在“下推”的概念。
- **引用了索引中的列**：WHERE 条件中需要过滤的列必须是索引的一部分。（例如，`name` 和 `age` 都是 `idx_name_age` 索引的列。）
- **适用于特定的查询条件**：对于 InnoDB 引擎，通常适用于以下访问方法：
    - RANGE（范围）
    - REF（引用）
    - EQ_REF（等值引用）
    - INDEX_SCAN（索引扫描）
- **不适用于所有情况**：
  - 如果查询已经使用了覆盖索引，无需回表，那么索引下推也就没有用武之地了。
  - 子查询、函数触发等复杂情况可能无法使用索引下推。

## 7. 函数索引（MySQL 8 支持），解决索引失效问题

在没有函数索引时，我们经常会遇到一种情况：即使列上有索引，但查询条件中对该列使用了函数，也会导致索引失效。

函数索引是一种基于表达式或函数计算结果来创建的索引，而不是直接基于列的原始值。可以在一个列上应用函数（如 `UPPER()`、
`LOWER()`、`DATE()` 等），然后为这个函数的结果建立索引，从而加速对这些函数化表达式的查询。

## 8. 索引失效情况

1. **对索引列进行运算或函数操作**：
    - 例如：`WHERE YEAR(create_time) = 2023` 或 `WHERE amount * 2 > 100`。
    - 解决方案：尽量避免在索引列上使用函数或运算，可以将运算移到条件另一边，或者使用计算列并为其建立索引。

2. **使用不等于（!= 或 <>）**：
    - 例如：`WHERE status != 'active'`。
    - 不等于操作符可能导致索引失效，因为需要检查所有行。

3. **使用 OR 连接条件**：
    - 例如：`WHERE a = 1 OR b = 2`，如果 a 和 b 分别有索引，但查询条件中使用了 OR，且 a 和 b 不是联合索引，那么索引可能会失效。
    - 解决方案：可以考虑使用 UNION 来重写查询。
   ```sql
   -- 失效：OR 条件中非索引列
   SELECT * FROM users WHERE name = 'John' OR salary = 5000;
   -- 如果只有 name 有索引，salary 无索引，则整个查询索引失效

   -- 有效：使用 UNION 优化
   SELECT * FROM users WHERE name = 'John'
   UNION
   SELECT * FROM users WHERE salary = 5000;
   ```

4. **LIKE 查询以通配符开头**：
    - 例如：`WHERE name LIKE '%abc'`。
    - 以通配符开头的 LIKE 查询无法使用索引，因为索引是按照前缀组织的。如果以通配符结尾，如 `'abc%'`，则可以使用索引。

5. **数据类型隐式转换**：
    - 例如：如果列是字符串类型，但查询时使用了数字，如 `WHERE id = '123'`，如果 id
      是整数类型，那么字符串会被转换为整数，但如果是列是字符串类型，而条件使用数字，则会导致索引失效。
    - 解决方案：确保查询条件中的数据类型与列定义的数据类型一致。

6. **复合索引未使用最左前缀**：
    - 例如：复合索引是 `(a, b, c)`，但查询条件中只使用了 b 和 c，没有使用 a，那么索引可能不会生效。
    - 解决方案：确保查询条件包含复合索引的最左列。

7. **索引列上使用 IS NULL 或 IS NOT NULL**：
    - 例如：`WHERE name IS NULL`。
    - 在索引列上使用 IS NULL 或 IS NOT NULL 可能使索引失效，因为索引不存储 NULL 值（对于非聚集索引，NULL
      值通常不被索引，但具体取决于数据库和索引类型）。

8. **查询条件中使用 NOT IN**：
    - 例如：`WHERE id NOT IN (1, 2, 3)`。
    - NOT IN 操作符可能导致索引失效，因为它需要检查所有行。

9. **全表扫描比使用索引更快**：
    - 当表中数据量很小，或者查询结果集很大（比如超过表数据的 30%），MySQL 优化器可能会选择全表扫描，因为全表扫描可能比使用索引更快。

10. **索引列被用于范围查询之后的列**：
    - 在复合索引中，如果某一列使用了范围查询（如 >、<、BETWEEN），那么其后面的列将无法使用索引。

11. **使用 ORDER BY 时，排序顺序与索引顺序不一致**：
    - 如果查询中使用了 ORDER BY，并且排序的列与索引的列顺序不一致，或者排序方向不一致（如一个升序一个降序），那么索引可能无法用于排序。

12. **使用不同的字符集或排序规则**：
    - 当进行连接查询时，如果两个表的字符集或排序规则不同，索引可能无法使用。

## MySQL执行计划
语法：`EXPLAIN SQL`，`EXPLAIN ANALYZE SQL`，`EXPLAIN FORMAT=JSON SQL`
`EXPLAIN SELECT * FROM users WHERE name = 'John Doe';`和`EXPLAIN ANALYZE SELECT * FROM users WHERE name = 'John Doe';`

### 结果分析

| 列名            | 描述                              |
|---------------|---------------------------------|
| id            | 查询的标识符，表示 SELECT 语句的执行顺序。       |
| select_type   | SELECT 查询的类型。                   |
| table         | 正在访问哪个表。                        |
| partitions    | 匹配的分区信息。                        |
| type          | （非常重要） 访问类型，即 MySQL 如何查找表中的行。   |
| possible_keys | 可能被选用的索引。                       |
| key           | （非常重要） 实际被选用的索引。                |
| key_len       | 使用的索引的长度。                       |
| ref           | 哪些列或常量被用于查找索引列上的值。              |
| rows          | （非常重要） MySQL 估计需要扫描的行数。         |
| filtered      | 表示存储引擎返回的数据在服务器层过滤后，剩余多少比例满足查询。 |
| Extra         | （非常重要） 额外的信息，包含查询执行的详细信息。       |

1. **id**
    - id 相同：执行顺序由上至下。
    - id 不同：如果是子查询，id 序号会递增，id 值越大优先级越高，越先被执行。
    - id 为 NULL：通常表示一个联合结果（如 UNION）。

2. **select_type**
    - SIMPLE：简单的 SELECT 查询，不包含子查询或 UNION。
    - PRIMARY：查询中若包含任何复杂的子部分，最外层的 SELECT 被标记为 PRIMARY。
    - SUBQUERY：在 SELECT 或 WHERE 列表中包含了子查询。
    - DERIVED：在 FROM 列表中包含的子查询被标记为 DERIVED（衍生），MySQL 会递归执行这些子查询，把结果放在临时表中。
    - UNION：UNION 中的第二个或后面的 SELECT 语句。
    - UNION RESULT：从 UNION 表获取结果的 SELECT。

3. **type（性能关键指标）**
   
    此列从好到坏排序，说明了表的访问方法。常见的类型有：
    - **system**：表只有一行记录（等于系统表），这是 const 类型的特例，性能极佳。
    - **const**：通过索引一次就找到了，用于比较 主键索引 或 唯一索引 的所有列与常数值比较时。例如
      `SELECT * FROM users WHERE id = 1;`，性能极佳。
    - **eq_ref**：在连接查询时，使用了 主键 或 唯一非空索引 进行关联。例如 `SELECT * FROM t1, t2 WHERE t1.id = t2.id;`
      ，性能极佳。
    - **ref**：使用 普通索引 进行扫描，可能返回多个匹配的行。例如 `SELECT * FROM users WHERE name = 'John';`（name
      是普通索引），性能良好。
    - **range**：只检索给定范围的行，使用一个索引来选择行。关键字的范围查询（BETWEEN, <, >, IN 等）。例如
      `SELECT * FROM users WHERE id > 10;`，性能良好。
    - **index**：全索引扫描。遍历整个索引树来查找数据，虽然只扫描索引，但比全表扫描快，因为索引文件通常比数据文件小。
    - **ALL**：全表扫描，没有使用索引。这是最坏的情况，需要检查表结构和查询条件，考虑增加索引，性能极差。
    - 目标：至少要让查询达到 range 级别，最好能达到 ref。

4. **key**
    - possible_keys 列出了可能使用的索引。
    - key 是优化器最终决定使用的索引。如果为 NULL，则表示没有使用索引。
    - 强制使用索引：`USE INDEX(index_name)`
    - 强制忽略索引：`IGNORE INDEX(index_name)`

5. **rows**
    - MySQL 优化器估算的为了找到所需的行而需要读取的行数。这个值越小越好。它是一个预估值，但能直观地反映查询的成本。

6. **Extra（包含重要细节）**

    此列包含非常多的重要信息：
    - **Using index**：覆盖索引，表示查询可以通过索引直接获取所有数据，无需回表。性能极佳。
      例如：`SELECT id FROM users WHERE name = ...`，如果 (name, id) 是一个复合索引，则数据可以直接从索引中获取。
    - **Using where**：表示在存储引擎检索行后，服务器层（Server）还需要进行过滤。这不一定是个坏信号，但如果在 type 是 ALL
      或 index 时出现，说明查询效率不高。
    - **Using temporary**：表示 MySQL 需要使用临时表来存储结果集，常见于排序（ORDER BY）和分组查询（GROUP
      BY），尤其是在没有索引帮助排序/分组时。**需要优化**。
    - **Using filesort**：MySQL 无法利用索引完成的排序操作，称为“文件排序”。它会在内存或磁盘上进行排序，效率较低。**需要优化**。
    - **Using join buffer (Block Nested Loop)**：表示连接查询时，被驱动表没有使用索引，需要用到连接缓冲区。**需要优化**。
    - **Impossible WHERE**：`WHERE` 子句的值始终为 `false`，查询不到任何数据。

### 最佳实践

- **关注核心列**：重点关注 `type`, `key`, `rows`, `Extra` 这几列。
- **优化目标**：
    - `type` 尽量达到 `range` 或 `ref`。
    - `rows` 越小越好。
    - `key` 尽量使用到合适的索引。
    - `Extra` 尽量避免出现 `Using temporary` 和 `Using filesort`，争取出现 `Using index`。

- **索引是利器**：合理的索引设计是优化的根本。考虑创建复合索引来覆盖查询条件、排序和分组字段。

- **理解数据**：`EXPLAIN` 的 `rows` 是估算值，与实际可能不符。在测试环境用真实数据验证。

### 实践

假设我们有两个表：

`users`表

- **id** (主键)
- **name** (VARCHAR)
- **age** (INT)
- 索引：**idx_name** (name), **idx_age** (age)

`orders`表

- **id** (主键)
- **user_id** (外键，关联 users.id)
- **amount** (DECIMAL)
- 索引：**idx_user_id** (user_id)

#### 场景 1：基础查询
```sql
EXPLAIN SELECT * FROM users WHERE name = 'Alice';
```

| id | select_type | table | type | possible_keys | key      | rows | Extra |
|----|-------------|-------|------|---------------|----------|------|-------|
| 1  | SIMPLE      | users | ref  | idx_name      | idx_name | 1    | NULL  |

分析：使用了 `idx_name` 索引，访问类型是 `ref`，预估扫描 1 行，非常高效。

#### 场景 2：全表扫描
```sql
EXPLAIN SELECT * FROM users WHERE age + 1 > 20;
```

| id | select_type | table | type | possible_keys | key  | rows | Extra       |
|----|-------------|-------|------|---------------|------|------|-------------|
| 1  | SIMPLE      | users | ALL  | NULL          | NULL | 1000 | Using where |

分析： 由于在 `age` 上使用了函数 `(age + 1)`，导致索引失效，进行了全表扫描（ALL），扫描了 1000 行。需要优化，可以改写查询为
`age > 19`。

#### 场景 3：连接查询与文件排序
```sql
EXPLAIN SELECT u.name, SUM(o.amount)
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.age > 30
GROUP BY u.name
ORDER BY u.name;
```

| id | select_type | table | type  | possible_keys | key         | rows | Extra                                        |
|----|-------------|-------|-------|---------------|-------------|------|----------------------------------------------|
| 1  | SIMPLE      | u     | range | idx_age       | idx_age     | 200  | Using where; Using temporary; Using filesort |
| 1  | SIMPLE      | o     | ref   | idx_user_id   | idx_user_id | 5    | NULL                                         |

分析：

- 驱动表`u` 使用 `idx_age` 索引进行范围查找，找到约 200 行。
- 对于找到的每一行，通过 `user_id` 索引去 `orders` 表里查找（`ref`），效率尚可。
- 问题在于 `Extra` 列中出现了 `Using temporary` 和 `Using filesort`。 因为 `GROUP BY u.name` 和 `ORDER BY u.name` 时，`name` 字段上没有合适的索引来帮助排序和分组，导致 MySQL 创建了临时表并进行了文件排序。
- 优化建议： 为 `users` 表创建一个覆盖索引 `(age, name)`。 这样在查找年龄大于 30 的用户时，可以直接使用该索引完成过滤、分组和排序，避免临时表和文件排序。

## PostgresSQL执行计划
```text
-- 只显示执行计划，不实际执行
EXPLAIN SELECT * FROM users WHERE age > 25;

-- 显示执行计划并实际执行，包含实际运行时间
EXPLAIN ANALYZE SELECT * FROM users WHERE age > 25;

-- 更详细的执行计划
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM users WHERE age > 25;

-- 包含格式化输出
EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM users WHERE age > 25;
```

### 典型结果
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT u.name, o.order_date, o.amount
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.age > 25 AND o.amount > 100;
```
```text
Hash Join  (cost=145.63..289.45 rows=1542 width=40) 
          (actual time=1.234..4.567 rows=1234 loops=1)
  Hash Cond: (o.user_id = u.id)
  ->  Seq Scan on orders o  (cost=0.00..98.42 rows=1542 width=20) 
                           (actual time=0.123..1.234 rows=2000 loops=1)
        Filter: (amount > 100)
        Rows Removed by Filter: 500
  ->  Hash  (cost=85.75..85.75 rows=1234 width=20) 
            (actual time=1.098..1.098 rows=1200 loops=1)
        Buckets: 2048  Batches: 1  Memory Usage: 125kB
        ->  Seq Scan on users u  (cost=0.00..85.75 rows=1234 width=20) 
                                (actual time=0.045..0.678 rows=1200 loops=1)
              Filter: (age > 25)
              Rows Removed by Filter: 800
Planning Time: 0.456 ms
Execution Time: 4.890 ms
```

### 核心指标详解

指标分为两大类：**代价/行数/数据量指标和节点操作类型指标**。

#### 类别一：代价、行数和数据量指标

这些是每个节点都会显示的基础指标，格式通常为：(cost=启动代价..总代价 rows=预估行数 width=平均行宽度)

- **cost（代价）**
    - **含义**：PostgreSQL 基于硬件性能（seq_page_cost, random_page_cost, cpu_tuple_cost
      等配置参数）计算出的一个无量纲的相对值，用于比较不同执行路径的开销。
    - **格式**：启动代价..总代价
    - **启动代价**：到达该节点输出第一行结果前需要花费的代价。例如，Sort 节点需要先把所有数据排序才能输出第一行，所以启动代价很高。
    - **总代价**：该节点输出所有结果的总代价。
    - **在 EXPLAIN ANALYZE 中**：cost 后面会跟实际执行的时间信息，如 (cost=10.00..20.00 rows=100 width=0) (actual
      time=0.100..1.500 rows=99 loops=1)。这里的 actual time 是毫秒为单位的实际时间。

- **rows（预估行数）**
    - **含义**：执行计划节点预估会输出的行数。
    - **重要性**：这是最关键的指标之一。优化器的预估是否准确，直接决定了它选择的执行计划是否优秀。如果 EXPLAIN ANALYZE 显示
      rows 的预估值和实际值（rows=99）差异巨大，通常意味着表的统计信息（pg_statistics）过时或不准确，你需要运行
      `ANALYZE table_name;` 来更新。

- **width（平均行宽度）**
    - **含义**：该节点输出的每一行数据的平均字节数。
    - **作用**：帮助你了解中间结果集或最终结果集的数据量大小。如果一个查询只需要几列但 width 很大，说明它可能获取了不必要的宽列（如
      TEXT 类型）。

- **actual time（实际执行时间）**
    - **含义**：EXPLAIN ANALYZE 独有的指标，表示该节点的实际执行耗时，单位是毫秒。
    - **格式**：启动时间..总时间。同样，启动时间是指输出第一行的时间，总时间是输出所有行的时间。

- **loops（循环次数）**
    - **含义**：该节点被执行的次数。对于顶层的节点，通常是1。但在嵌套循环连接中，内层节点会被执行多次。
    - **示例**：如果一个 Index Scan 的 loops=100，说明这个索引扫描被执行了100次。计算总耗时时，需要用 actual time 的平均值乘以
      loops。

#### 类别二：节点操作类型指标（扫描、连接、聚合等）

不同的操作节点有其特有的关键指标。

##### A. 扫描方式（Scan Methods）

- **Seq Scan（全表扫描）**
    - **含义**：逐行读取整个表。
    - **何时使用**：表很小，或者需要返回大部分数据时。
    - **调优**：如果对大表进行全表扫描且返回行数很少，通常意味着缺少有效的索引。

- **Index Scan（索引扫描）**
    - **含义**：通过索引找到匹配行的位置（ctid），然后回表读取数据。
    - **关键指标**：Index Cond（索引条件），显示了在索引上应用的条件。

- **Index Only Scan（仅索引扫描）**
    - **含义**：所有需要的数据都包含在索引中，无需回表。这是最理想的扫描方式。
    - **关键指标**：Heap Fetches（堆读取次数），理想情况下应为0。如果不为0，说明由于表（堆）的可见性映射（VM）问题，还是需要访问表数据。

- **Bitmap Heap Scan & Bitmap Index Scan**
    - **含义**：先通过 Bitmap Index Scan 在索引中匹配所有条件，将结果的位置（ctid）在内存中构建一个位图。然后 Bitmap Heap
      Scan 根据这个位图按物理顺序去表中读取数据。这结合了索引的筛选能力和顺序IO的效率。
    - **适用场景**：多条件查询，且单个条件筛选度不高，组合起来筛选度高时。

##### B. 连接方式（Join Methods）

- **Nested Loop（嵌套循环连接）**
    - **工作方式**：遍历外表（outer table）的每一行，对于每一行，遍历内表（inner table）寻找匹配行。
    - **适用场景**：其中一个数据集非常小（例如，<100行）。内表必须有高效的访问路径（如索引）。
    - **代价模型**：总代价 ≈ 外表行数 × 内表每次查找的代价。

- **Hash Join（哈希连接）**
    - **工作方式**：扫描较小的表（驱动表），在内存中为其构建一个哈希表。然后扫描较大的表，对其每一行计算哈希值，在哈希表中寻找匹配项。
    - **适用场景**：连接两个较大的表，且没有索引可用，或者等值连接（=）。
    - **关键指标**：Hash Buckets（哈希桶数量），Batches（批次）。如果 Batches > 1，说明内存不足，需要用到磁盘临时文件，性能会下降。

- **Merge Join（归并连接）**
    - **工作方式**：先将两个表都按照连接键进行排序，然后像拉链一样合并两个已排序的结果集。
    - **适用场景**：两个表都很大，且连接键上已有索引（已排序），或者非等值连接（如 <, <= 等）。
    - **前提条件**：数据在连接键上必须是有序的。

##### C. 其他重要操作

- **Sort（排序）**
    - **关键指标**：Sort Method（排序方法）。
        - **quicksort**：内存排序，速度快。
        - **external merge**：外部归并排序，当数据量超过 work_mem 设置时，会使用磁盘临时文件，性能急剧下降。如果你看到这个，通常意味着需要增加
          work_mem 参数。
    - **Sort Space Used**：排序操作使用的内存大小。

- **HashAggregate / GroupAggregate（聚合）**
    - **HashAggregate**：为每个分组在内存中构建一个哈希表。适用于分组数量多，但每个组数据量不大的情况。
    - **GroupAggregate**：要求输入数据已经按分组键排序，然后顺序扫描进行聚合。通常在有索引支持排序或上游有 Sort 节点时使用。

- **Limit（限制）**
    - **说明**：如果一个 Sort 节点下面有 Limit，并且排序方式使用了索引，那么它可能很快，因为它不需要排序所有数据，只需要找到前N行。

### 分析流程

遵循以下步骤，可以系统化地分析和解决性能问题。

#### 第1步：定位瓶颈节点

使用 `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` 获取详细计划，然后：

- **找到最耗时的节点**：寻找 `actual time` 最大的节点。这是你的主要优化目标。
- **检查资源消耗**：
    - **BUFFERS**：查看 `shared hit`（缓存命中）和 `read`（物理读）。大量的 `read` 意味着 I/O 瓶颈。
    - **Sort/Hash 的磁盘使用**：如果出现 `Sort Method: external merge Disk` 或 `Hash Batches: >1`，说明 `work_mem` 不足。

#### 第2步：分析瓶颈节点的根本原因

针对找到的瓶颈节点，问自己以下问题：

##### A. 对于扫描操作（Scan）

- **问题**：为什么是 `Seq Scan` 而不是 `Index Scan`？
    - **原因1**：无索引。查询条件（`WHERE`）或连接条件（`JOIN`）的列上没有索引。
    - **原因2**：索引无效。查询条件无法使用索引（例如，对索引列使用了函数 `WHERE lower(name) = 'alice'`）。
    - **原因3**：表太小。序列扫描比索引扫描更快（例如，表只有 100 行）。
    - **原因4**：查询需要大部分数据。如果查询要返回表中超过 ~5-30% 的数据，优化器可能认为全表扫描比随机 IO 的索引扫描更高效。

- **问题**：为什么是 `Index Scan` 而不是 `Index Only Scan`？
    - **原因**：索引不包含所有查询所需的列（“覆盖索引”），导致需要回表（`Heap Fetches`）。

##### B. 对于连接操作（Join）

- **问题**：为什么 `Nested Loop` 这么慢？
    - **原因**：内表（inner table）没有高效的访问路径（通常是缺少索引），导致内表被多次全表扫描。

- **问题**：为什么 `Hash Join` 这么慢？
    - **原因1**：`work_mem` 不足，导致 `Batches` 增多，使用了磁盘。
    - **原因2**：驱动表（用来构建哈希表的小表）实际上并不小，或者预估严重不准。

- **问题**：为什么 `Merge Join` 这么慢？
    - **原因**：输入的数据集没有预先排序，需要额外的排序操作，而排序本身很耗时。

##### C. 对于排序和聚合操作（Sort/Aggregate）

- **问题**：为什么排序这么慢？
    - **原因1**：`work_mem` 不足，导致使用了磁盘排序。
    - **原因2**：排序的数据量非常大。
    - 具体优化方式见前文。

#### 第3步：制定并实施优化策略

根据上一步的分析，采取相应的行动。

| 瓶颈现象              | 可能原因        | 优化策略                                                                          |
|-------------------|-------------|-------------------------------------------------------------------------------|
| 高耗时的 Seq Scan     | 缺少索引        | 创建索引：`CREATE INDEX CONCURRENTLY idx_name ON table(column)`                    |
|                   | 索引失效（如使用函数） | 创建函数索引：`CREATE INDEX ON table (lower(column))` 或重写查询                          |
|                   | 查询需要大量数据    | 考虑使用覆盖索引，或优化查询只取所需列                                                           |
| Nested Loop 内表扫描慢 | 内表连接键无索引    | 为内表创建索引：`CREATE INDEX ON inner_table(join_column)`                            |
| Hash Join 使用磁盘    | work_mem 不足 | 增加 work_mem：`SET work_mem = '256MB';` (可在会话级设置)                               |
| Sort 使用磁盘         | work_mem 不足 | 增加 work_mem                                                                   |
|                   | 排序无法避免      | 创建索引以消除排序：`CREATE INDEX ON table (order_by_column)`                           |
| Index Scan 回表多    | 非覆盖索引       | 创建覆盖索引：`CREATE INDEX ON table (col1, col2) INCLUDE (col3, col4)`              |
| 预估行数严重偏离实际        | 统计信息过时      | 更新统计信息：`ANALYZE table_name;`                                                  |
|                   | 数据分布不均      | 增加统计信息细节：`ALTER TABLE ... ALTER COLUMN ... SET STATISTICS 1000;` 然后 `ANALYZE` |

### 实战

**场景：一个分页查询非常慢。**

**原始查询：**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders WHERE user_id = 123 AND status = 'shipped'
ORDER BY created_at DESC
LIMIT 10 OFFSET 0;
```

**优化前执行计划（简化）：**
```text
Limit  (cost=10000.00..10000.02 rows=10 width=50) (actual time=500.000..500.005 rows=10 loops=1)
  Buffers: shared hit=5000 read=2000
  ->  Sort  (cost=10000.00..10500.00 rows=50000 width=50) (actual time=500.000..450.000 rows=50010 loops=1)
        Sort Key: created_at DESC
        Sort Method: external merge  Disk: 8000kB
        Buffers: shared hit=5000 read=2000
        ->  Seq Scan on orders  (cost=0.00..7500.00 rows=50000 width=50) (actual time=0.100..200.000 rows=50000 loops=1)
              Filter: ((user_id = 123) AND (status = 'shipped'::text))
              Rows Removed by Filter: 500000
              Buffers: shared hit=5000 read=2000
```

**分析：**

- **瓶颈节点**：Sort 节点，它消耗了大部分时间（450ms），并且使用了磁盘（external merge）。
- **根本原因**：
    - Sort 之所以需要，是因为 Seq Scan 返回了 50,000 行数据，然后才进行排序。
    - Seq Scan 之所以发生，是因为 WHERE 条件 (user_id, status) 上没有合适的索引。
    - 预估和实际行数基本一致，统计信息是准的。
- **优化策略**：
    - **创建复合索引**：将过滤条件和排序条件结合起来，这样可以直接按顺序返回数据，避免排序。
    - **索引顺序**：先放等值过滤的列，再放范围过滤或排序的列。

**优化行动：**

```sql
CREATE INDEX CONCURRENTLY idx_orders_user_status_created
ON orders (user_id, status, created_at DESC);
```

**优化后执行计划（理想情况）：**
```text
Limit  (cost=0.42..1.25 rows=10 width=50) (actual time=0.050..0.060 rows=10 loops=1)
  Buffers: shared hit=15
  ->  Index Scan using idx_orders_user_status_created on orders  (cost=0.42..500.00 rows=50000 width=50) (actual time=0.045..0.055 rows=10 loops=1)
        Index Cond: ((user_id = 123) AND (status = 'shipped'::text))
        Buffers: shared hit=15
```

**效果对比：**

- 执行时间：从 ~500ms 下降到 ~0.06ms。
- 扫描方式：从全表扫描（读取7000个块）变为索引扫描（读取15个块）。
- 排序操作：完全消除，因为索引已经按 `created_at DESC` 排好序。
- 资源消耗：从使用大量I/O和磁盘排序，变为几乎纯内存操作。

### 其它优化

**参数调优**

- **work_mem**：针对排序和哈希操作。可以在会话级别为复杂查询临时增加。
- **shared_buffers**：数据库缓存。通常设置为系统内存的25%。
- **random_page_cost**：如果使用SSD，将其降低（如从4.0设为1.1）可以促使优化器更倾向于索引扫描。

**查询重写**

- 有时，将 `IN` 子查询改为 `EXISTS` 或 `JOIN` 会有奇效。
- 避免在 `WHERE` 子句中对索引列使用函数。
- 使用 `OFFSET ... LIMIT` 进行深部分页时效率极低，考虑使用“游标”或“基于键的分页”（例如 `WHERE id > last_id LIMIT 10`）。

**统计信息**

- 定期（或在大量数据变更后）运行 `ANALYZE`。
- 对于数据分布极不均匀的列，增加 `STATISTICS` 以提高预估准确性。