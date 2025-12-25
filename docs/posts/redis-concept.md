---
category:
  - 分布式系统
  - redis
tag:
  - 分布式
  - 缓存
date: 2025-12-25
star: true
---

# Redis 简介

Redis（Remote Dictionary Server）是一个开源的内存数据结构键值存储系统，可以用作数据库、缓存和消息中间件。它支持多种数据结构，如： 字符串、哈希、列表、集合和有序集合等。

Redis 提供了丰富的操作命令，并将数据存储在内存中，因此具有极高的读写性能。同时，它也支持持久化，可以将数据保存到磁盘上，确保数据的安全。

Redis 还支持以下高可用架构，能够满足不同场景下的需求：

- 主从复制
- 哨兵模式
- 集群模式

## 数据结构

| 数据类型             | 特点                                                   | 实现原理                                                            | 典型应用                                                      |
|------------------|------------------------------------------------------|-----------------------------------------------------------------|-----------------------------------------------------------|
| String（字符串）      | 1. 二进制安全，可存文本/数字/二进制<br>2. 最大512MB<br>3. 支持原子操作      | 1. SDS（Simple Dynamic String）实现<br>2. 预分配空间，减少内存分配<br>3. 惰性删除空间 | 1. 缓存（session/页面）<br>2. 计数器（INCR/DECR）<br>3. 分布式锁（SET NX） |
| Hash（哈希）         | 1. 字段-值对集合<br>2. 适合存储对象<br>3. 每个Hash可存2³²-1对         | 1. 哈希表 + 压缩列表<br>2. 小Hash用ziplist节省内存<br>3. 大Hash用hashtable     | 1. 用户信息存储<br>2. 商品属性<br>3. 配置项管理                          |
| List（列表）         | 1. 有序字符串集合<br>2. 按照插入顺序排序<br>3. 可重复元素<br>4. 两端操作O(1) | 1. 快速链表（quicklist）<br>2. 双向链表节点 + ziplist<br>3. 压缩中间节点节省内存      | 1. 消息队列<br>2. 最新文章列表<br>3. 任务队列                           |
| Set（集合）          | 1. 无序唯一元素集合<br>2. 支持集合运算<br>3. 最大2³²-1元素             | 1. 哈希表实现（值NULL）<br>2. 小集合用intset（整数集合）<br>3. 自动升级结构             | 1. 标签系统<br>2. 共同好友<br>3. 独立IP统计                           |
| Sorted Set（有序集合） | 1. 元素唯一，分数可重复<br>2. 按分数排序<br>3. 范围查询高效               | 1. 哈希表 + 跳表（skiplist）<br>2. 小集合用ziplist<br>3. O(logN)查找插入       | 1. 排行榜<br>2. 带权重队列<br>3. 范围查找                             |
| Bitmaps（位图）      | 1. 本质上就是String<br>2. 按位操作<br>3. 极其节省空间               | 1. 基于String的位操作<br>2. SETBIT/GETBIT命令<br>3. 自动扩展                | 1. 用户签到<br>2. 活跃用户统计<br>3. 布隆过滤器                          |
| HyperLogLog      | 1. 基数估算<br>2. 误差率0.81%<br>3. 固定12KB内存                | 1. 概率算法<br>2. 使用16384个6bit寄存器<br>3. 分桶调和平均数                     | 1. UV统计<br>2. 独立搜索词统计<br>3. 大规模去重                         |
| Geospatial（地理位置） | 1. 存储经纬度<br>2. 距离计算<br>3. 范围查询                       | 1. 基于Sorted Set实现<br>2. GeoHash编码<br>3. 将二维坐标映射为一维              | 1. 附近的人<br>2. 地理位置搜索<br>3. 距离计算                           |
| Stream（流）        | 1. Redis 5.0+<br>2. 消息持久化<br>3. 消费者组                 | 1. Rax树（基数树）<br>2. 链表存储消息<br>3. 可持久化                            | 1. 消息队列<br>2. 事件溯源<br>3. 日志收集                             |

### String（字符串）

#### 内部实现

```c
// SDS（简单动态字符串）结构
struct sdshdr {
    int len;     // 已使用字节数
    int free;    // 未使用字节数
    char buf[];  // 字节数组
};
```

#### 编码类型

- **int**：存储整数值时（64位有符号）
- **embstr**：短字符串（≤44字节），与对象头连续存储
- **raw**：长字符串（＞44字节），独立分配内存

#### 内存布局

- **int编码**：[Redis对象头] -> 整数存储
- **embstr编码**：[Redis对象头 | SDS头 | 字符串内容]（连续内存）
- **raw编码**：[Redis对象头] -> [SDS头 | 字符串内容]（分离内存）

#### 核心特性

- **二进制安全**：可存储任意数据，不限于文本。
- **预分配机制**：空间不足时，会多分配空间（小于1MB时翻倍，大于1MB时每次加1MB）。
- **惰性释放**：缩短字符串时不立即回收内存。

#### 使用示例

```shell
# 数值操作
SET counter 100
INCR counter        # 原子+1
INCRBY counter 10   # 原子+10

# 位操作
SETBIT user:sign:202401 5 1   # 第5位设1（用户第5天签到）
BITCOUNT user:sign:202401     # 统计1的个数

# 批量操作（Pipeline）
MSET key1 "val1" key2 "val2"
MGET key1 key2
```

### Hash（哈希表）

#### 底层实现

```c
// 哈希表节点
struct dictEntry {
    void *key;          // 键
    union {
        void *val;
        uint64_t u64;
        int64_t s64;
        double d;
    } v;               // 值
    struct dictEntry *next;  // 哈希冲突链表
};

// 哈希表
struct dictht {
    dictEntry **table;      // 哈希表数组
    unsigned long size;     // 表大小
    unsigned long sizemask; // 掩码（size-1）
    unsigned long used;     // 已用节点数
};
```

#### 编码转换规则

```text
条件判断：元素数量 ≤ 512 且 所有值长度 ≤ 64字节
          ↓
  满足 → ziplist（压缩列表）
  不满足 → hashtable（哈希表）
```

#### 哈希表扩容机制

渐进式 rehash 过程：

1. 同时维护两个哈希表（`ht[0]` 和 `ht[1]`）。
2. 将 `ht[0]` 的键值对逐步迁移到 `ht[1]`。
3. 迁移期间：查找先查 `ht[0]`，再查 `ht[1]`。
4. 新增键值对直接存入 `ht[1]`。
5. 迁移完成后，释放 `ht[0]`，将 `ht[1]` 设为 `ht[0]`。

#### 使用示例

```shell
# 存储用户对象
HSET user:1000 username "alice" age 25 email "alice@example.com"

# 批量操作
HMSET product:1001 name "Laptop" price 999 stock 50

# 字段递增
HINCRBY user:1000 age 1

# 获取所有字段
HGETALL user:1000
```

### List（列表）

#### 底层实现

```c
// quicklist节点（每个节点是一个ziplist）
struct quicklistNode {
    quicklistNode *prev;
    quicklistNode *next;
    unsigned char *zl;   // 指向ziplist
    unsigned int sz;     // ziplist字节大小
    unsigned int count;  // ziplist元素数量
    // ... 其他字段
};

// quicklist
struct quicklist {
    quicklistNode *head;
    quicklistNode *tail;
    unsigned long count;  // 所有ziplist元素总数
    unsigned long len;    // quicklistNode节点数
    int fill : 16;        // 每个ziplist最大元素数（配置文件list-max-ziplist-size）
    unsigned int compress : 16;  // 压缩深度（list-compress-depth）
};
```

#### 使用示例

```shell
# 生产者
LPUSH task_queue "task1"
LPUSH task_queue "task2"

# 消费者（阻塞直到有数据）
BRPOP task_queue 30  # 等待30秒

# 多个队列监听
BLPOP queue1 queue2 0  # 0表示无限等待
```

### Set（集合）

#### 底层实现

```c
// intset（整数集合）结构
struct intset {
    uint32_t encoding;  // 编码：INTSET_ENC_INT16/INT32/INT64
    uint32_t length;    // 元素数量
    int8_t contents[];  // 元素数组（有序）
};

// hashtable实现时：值为NULL的字典
```

#### 编码转换

```text
条件判断：所有元素都是整数 且 元素数量 ≤ 512
          ↓
  满足 → intset（节省内存）
  不满足 → hashtable
```

#### 集合运算复杂度

```shell
SINTER key1 key2 key3      # O(N*M)  N是最小集合大小，M是集合数量
SUNION key1 key2           # O(N)    N是所有集合元素总数
SDIFF key1 key2            # O(N)    N是所有集合元素总数
```

#### 使用示例

```shell
# 标签系统
SADD article:1001:tags "database" "nosql" "redis"
SADD user:alice:tags "programming" "redis"

# 共同兴趣
SINTER user:alice:tags user:bob:tags

# 随机推荐
SRANDMEMBER tags:programming 3
```

### Sorted Set（有序集合）

#### 底层结构：跳表 + 哈希表

```c
// 跳表节点
struct zskiplistNode {
    sds ele;                     // 成员
    double score;                // 分数
    struct zskiplistNode *backward;  // 后退指针
    struct zskiplistLevel {
        struct zskiplistNode *forward;  // 前进指针
        unsigned long span;             // 跨度
    } level[];                    // 层数组
};

// 跳表
struct zskiplist {
    struct zskiplistNode *header, *tail;
    unsigned long length;    // 节点数量
    int level;               // 最大层数
};
```

#### 内存布局

```text
[哈希表]：ele -> score（O(1)查找分数）
[跳表]：按score排序（O(logN)范围查询）
```

#### 编码转换

```text
条件判断：元素数量 ≤ 128 且 所有成员长度 ≤ 64字节
          ↓
  满足 → ziplist（按score排序）
  不满足 → skiplist + hashtable
```

#### 使用示例

```shell
# 游戏排行榜
ZADD leaderboard 1500 "player1" 1480 "player2" 1520 "player3"

# 获取前10名
ZREVRANGE leaderboard 0 9 WITHSCORES

# 分数范围查询
ZRANGEBYSCORE leaderboard 1400 1500

# 排名查询
ZRANK leaderboard "player1"     # 正序排名（从0开始）
ZREVRANK leaderboard "player1"  # 逆序排名

# 增减分数
ZINCRBY leaderboard 50 "player1"
```

### Bitmaps（位图）

#### 底层实现

```c
// 本质是String，每个字节8位
// SETBIT操作会自动扩展字符串
```

#### 内存计算

```text
假设有1亿用户，每天签到记录：
传统方案：1亿 * 1字节 = 100MB
Bitmaps：1亿位 ≈ 12.5MB
```

#### 常用操作模式

```shell
# 用户签到系统
SETBIT user:sign:202401:1001 0 1   # 用户1001第1天签到
SETBIT user:sign:202401:1001 6 1   # 第7天签到

# 统计连续签到
BITOP AND week_sign user:sign:202401:1001 mask_week

# 活跃用户统计
SETBIT active:20240101 1001 1
SETBIT active:20240102 1001 1
BITOP OR monthly_active active:20240101 active:20240102
BITCOUNT monthly_active
```

### HyperLogLog

#### 算法原理

1. 哈希函数将元素映射为64位二进制
2. 取低14位作为寄存器索引（16384个寄存器）
3. 统计高位连续0的个数+1
4. 取所有寄存器值的调和平均数
5. 乘以校正因子α_m（m=16384时为0.7213）

#### 基本操作

```shell
# 添加元素
PFADD key element [element ...]    # 返回1如果基数发生变化

# 统计基数
PFCOUNT key [key ...]              # 返回估算的唯一元素数

# 合并多个HLL
PFMERGE destkey sourcekey [sourcekey ...]

# 示例：统计独立访客
PFADD daily:uv 192.168.1.1 192.168.1.2 192.168.1.1
PFCOUNT daily:uv  # 返回2
```

#### 使用示例

```shell
# 添加地理位置
GEOADD cities 116.405285 39.904989 "Beijing"
GEOADD cities 121.473701 31.230416 "Shanghai"

# 计算距离（单位：m/km/mi/ft）
GEODIST cities Beijing Shanghai km

# 附近搜索
GEORADIUS cities 116.40 39.90 100 km WITHDIST WITHCOORD

# 获取GeoHash值
GEOHASH cities Beijing  # 返回wx4g0b7xrt0
```

### Stream（流）

#### 使用示例

```shell
# 添加消息
XADD mystream * sensor-id 1234 temperature 19.8

# 读取消息
XREAD COUNT 2 STREAMS mystream 0-0

# 创建消费者组
XGROUP CREATE mystream mygroup 0-0

# 消费者组读取
XREADGROUP GROUP mygroup consumer1 COUNT 1 STREAMS mystream >
```

## 过期策略

Redis 使用两种主要策略来管理键的过期和删除：过期键删除策略 和 内存淘汰策略。

### 过期键删除策略

Redis 采用 **惰性删除** 和 **定期删除** 的组合策略来删除过期键。

#### 惰性删除 (Lazy Expiration)

- **原理**：当客户端访问一个键时，Redis 会检查该键是否已过期，如果过期则立即删除。
- **优点**：
    - CPU 友好，只在使用时检查。
    - 避免不必要的删除操作。
- **缺点**：
    - 内存不友好，已过期但未被访问的键会一直占用内存。
    - 可能导致内存泄漏。

#### 定期删除 (Periodic Expiration)

- **原理**：Redis 定期随机抽取一部分设置了过期时间的键，检查并删除其中的过期键。
- **执行流程**：
    1. 从设置了过期时间的键中随机抽取 20 个键（默认）。
    2. 删除其中已过期的键。
    3. 如果过期键比例超过 25%，重复步骤 1。
- **优点**：
    - 减少内存占用。
- **缺点**：
    - 需要平衡执行频率和 CPU 消耗。

### 内存淘汰策略 (Eviction Policies)

当内存达到 `maxmemory` 限制时，Redis 根据配置的淘汰策略删除键。

1. 不淘汰策略
    - `noeviction`：默认策略，内存不足时新写入操作报错，读操作正常。

2. 从设置了过期时间的键中淘汰
    - `volatile-lru`：使用 LRU 算法删除最近最少使用的过期键
    - `volatile-lfu`：使用 LFU 算法删除最不经常使用的过期键
    - `volatile-random`：随机删除过期键
    - `volatile-ttl`：优先删除生存时间较短的键

3. 从所有键中淘汰
    - `allkeys-lru`：从所有键中使用 LRU 删除
    - `allkeys-lfu`：从所有键中使用 LFU 删除
    - `allkeys-random`：随机删除所有键

| 策略             | 特点              | 适用场景           |
|----------------|-----------------|----------------|
| noeviction     | 不删除，保证数据安全      | 数据不能丢失，可接受写入失败 |
| volatile-ttl   | 优先删除快过期的键       | 希望尽快释放过期键内存    |
| volatile-lru   | 删除最近最少使用的过期键    | 热点数据集中在过期键中    |
| allkeys-lru    | 从所有键中删除最近最少使用的键 | 无明确热点，希望保留常用数据 |
| allkeys-lfu    | 删除访问频率最低的键      | 需要根据访问频率淘汰     |
| allkeys-random | 随机删除            | 数据访问均匀分布       |

#### 相关配置

```conf
# 最大内存限制
maxmemory 2gb

# 内存淘汰策略
maxmemory-policy volatile-lru

# LRU/LFU 算法采样精度
maxmemory-samples 5

# 定期删除执行频率（Hz）
hz 10
```

## 持久化

Redis提供两种主要的持久化机制：RDB（Redis Database）和AOF（Append Only File），以及从4.0版本开始的混合持久化。

### RDB持久化

1. **工作原理**
   RDB 通过创建内存数据的快照（snapshot）来实现持久化。快照文件是经过压缩的二进制文件。

2. **触发方式**

    - **自动触发**

      ```conf
      # redis.conf配置示例
      save 900 1      # 900秒内至少有1个key被修改
      save 300 10     # 300秒内至少有10个key被修改
      save 60 10000   # 60秒内至少有10000个key被修改
      ```

    - **手动触发**
        - `SAVE`：阻塞 Redis 服务器进程，直到 RDB 文件创建完毕。
        - `BGSAVE`：派生 (fork) 子进程创建 RDB，父进程继续处理请求（生产环境推荐）。

    - **其他触发**
        - 执行 `SHUTDOWN` 或 `FLUSHALL` 命令时。
        - 主从复制时，从节点首次同步。

#### RDB文件结构

```text
+-------+---------+--------+------------------+---------+
| REDIS | RDB版本 | 数据区 | EOF(结束标志)    | 校验和  |
+-------+---------+--------+------------------+---------+
```

#### 配置参数

```text
# RDB文件名
dbfilename dump.rdb

# 保存目录
dir /var/lib/redis

# 后台保存出错时是否停止写入
stop-writes-on-bgsave-error yes

# 是否压缩RDB文件
rdbcompression yes

# 是否校验RDB文件
rdbchecksum yes
```

#### 优点

- 恢复速度快：二进制文件直接加载到内存
- 文件紧凑：适合备份和灾难恢复
- 最大化性能：fork子进程处理，主进程不阻塞

#### 缺点

- 数据丢失风险：最后一次快照后的数据可能丢失
- fork可能阻塞：数据量大时，fork操作耗时
- 文件一致性：非实时持久化

### AOF持久化

#### **工作原理**
   AOF记录每个写命令，以Redis协议格式追加到文件末尾。

#### **写入流程**
    - 客户端命令 → Redis执行 → 写入AOF缓冲区 → 同步到磁盘

#### **同步策略**
   ```conf
   appendfsync always    # 每个写命令都同步，数据最安全，性能最差
   appendfsync everysec  # 每秒同步一次（默认推荐）
   appendfsync no        # 由操作系统决定何时同步
   ```

#### **AOF重写机制**

1. **AOF文件膨胀问题**
   随着Redis运行，AOF文件会不断记录所有写命令，导致文件持续增长。例如：

    - 对同一个key进行100次INCR操作，AOF会记录100条命令。
    - 但实际上只需要一条`SET key 100`命令就能恢复数据状态。

2. **重写带来的好处**
    - 减小文件体积：减少磁盘占用。
    - 加快恢复速度：需要重放的命令更少。
    - 提高写入性能：更小的文件写入更快。

3. **基本原理**
   从当前数据库状态出发，逆向生成最小命令集，使得恢复后的数据状态与当前完全一致。

4. **重写过程示例**

```shell
# 原始AOF文件（简化示意）
SET counter 1
INCR counter      # counter=2
INCR counter      # counter=3
DEL counter
SET counter 100
INCR counter      # counter=101

# 重写后的AOF文件
SET counter 101   # 直接记录最终状态
```

##### 触发条件
```conf
# redis.conf配置
auto-aof-rewrite-percentage 100   # 当前AOF文件大小比上次重写后大小增加100%
auto-aof-rewrite-min-size 64mb    # AOF文件至少达到64MB才开始重写
```
触发条件公式：
```text
当前AOF文件大小 > 上次重写后大小 * (1 + auto-aof-rewrite-percentage/100)
且
当前AOF文件大小 > auto-aof-rewrite-min-size
```

##### 重写流程图

```text
┌─────────────┐
│  父进程收到  │
│ 重写命令/信号 │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ fork()创建   │
│   子进程     │
└──────┬──────┘
       │
       ├─────────────────────────────────┐
       ▼                                 │
┌─────────────┐                   ┌─────────────┐
│   子进程     │                   │   父进程     │
├─────────────┤                   ├─────────────┤
│ 1. 遍历所有  │                   │ 1. 继续处理  │
│   数据库键   │                   │   客户端请求 │
│             │                   │             │
│ 2. 生成当前  │                   │ 2. 将写命令同│
│   数据快照   │                   │   时写入到： │
│             │                   │   a) AOF缓冲区│
│ 3. 写入临时  │                   │   b) AOF重写 │
│   AOF文件    │                   │      缓冲区  │
│             │                   │             │
│ 4. 完成写入  │                   │ 3. 等待子进 │
│   后退出     │                   │   程完成信号 │
└──────┬──────┘                   └──────┬──────┘
       │                                 │
       └──────────────┬──────────────────┘
                      │
                      ▼
┌─────────────┐
│ 父进程将AOF   │
│ 重写缓冲区内容│
│ 追加到新文件  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 原子替换    │
│ 旧AOF文件   │
└─────────────┘
```

#### **配置参数**
   ```conf
   # 开启AOF
   appendonly yes

   # AOF文件名
   appendfilename "appendonly.aof"

   # AOF文件保存目录（与RDB相同）
   dir /var/lib/redis

   # 同步策略
   appendfsync everysec

   # 重写时不进行fsync
   no-appendfsync-on-rewrite no

   # 加载损坏的AOF文件时是否继续
   aof-load-truncated yes
   ```

#### **AOF文件修复**
   ```bash
   redis-check-aof --fix appendonly.aof
   ```

#### **优点**
    - 数据安全：最多丢失1秒数据（everysec策略）
    - 可读性：文本格式，便于理解和修复
    - 自动重写：避免文件无限增长

#### **缺点**
    - 文件较大：比RDB文件大
    - 恢复较慢：需要重新执行所有命令
    - 性能影响：高写入负载时影响性能

### 混合持久化（Redis 4.0+）

1. **工作原理**
   AOF重写时，将当前内存数据以RDB格式写入AOF文件，后续写命令以AOF格式追加。

2. **文件结构**
   ```
   [RDB格式数据][AOF格式增量命令]
   ```

3. **开启配置**
   ```conf
   # 开启混合持久化
   aof-use-rdb-preamble yes
   ```

4. **优点**
    - **快速恢复**：RDB格式加载快
    - **数据完整**：AOF保证数据不丢失
    - **兼容性好**：旧版本Redis可读取RDB部分

### 对比

| 特性    | RDB       | AOF    | 混合持久化  |
|-------|-----------|--------|--------|
| 持久化方式 | 快照        | 日志     | 快照+日志  |
| 文件大小  | 小         | 大      | 中等     |
| 恢复速度  | 快         | 慢      | 快      |
| 数据安全  | 可能丢失数据    | 最多丢失1秒 | 最多丢失1秒 |
| 性能影响  | fork时可能阻塞 | 写入时影响  | 写入时影响  |
| 可读性   | 二进制       | 文本     | 混合格式   |

## 主从复制 (Replication)

### 基本概念

主从复制是最基础的数据备份方案，通过复制实现数据冗余。

### 架构原理

```text
- 主节点 (Master)   → 从节点 (Slave1)
-                  → 从节点 (Slave2)
-                  → 从节点 (Slave3)
```

### 工作流程

1. 从节点启动后，向主节点发送 `SYNC` 命令。
2. 主节点执行 `BGSAVE` 生成 RDB 文件，期间新写入命令存入缓冲区。
3. 主节点将 RDB 发送给从节点，从节点加载 RDB。
4. 主节点将缓冲区的命令发送给从节点执行。
5. 之后主节点的每个写命令都异步发送给从节点。

### 特点

- **读写分离**：主节点负责写，从节点负责读。
- **数据冗余**：从节点是主节点的完整副本。
- **故障需手动干预**：主节点故障时需要人工切换。

### 配置示例

```text
# 从节点配置
slaveof 192.168.1.100 6379
masterauth <password>  # 如果主节点有密码
```

## 哨兵模式 (Sentinel)

Redis哨兵(Sentinel)是Redis官方推荐的高可用性解决方案，用于监控、自动故障转移和配置管理Redis**主从集群**。

### 架构原理

```text
+----------+     +----------+     +----------+
| Sentinel |     | Sentinel |     | Sentinel |
|  节点1   |     |  节点2   |     |  节点3   |
+----+-----+     +-----+----+     +-----+----+
     |                 |                 |
     |      +----------v-----------------v----------+
     |      |         Redis主节点(Master)           |
     |      |            Port: 6379                |
     |      +----------+---------------------------+
     |                 | 主从复制
     |      +----------v---------------------------+
     |      |         Redis从节点(Slave1)          |
     |      |            Port: 6380                |
     |      +--------------------------------------+
     |                 
     |      +----------v---------------------------+
     |      |         Redis从节点(Slave2)          |
     |      |            Port: 6381                |
     |      +--------------------------------------+
```

**核心功能**

- **监控**：定期检查主从节点健康状态
- **通知**：通过 API 通知系统管理员
- **自动故障转移**：主节点故障时，自动选举新主节点
- **配置提供者**：为客户端提供当前主节点地址

### 哨兵集群要点

- **哨兵实例数量**：至少 3 个哨兵实例（避免脑裂）
- **共识算法**：采用 Raft 算法实现共识
- **故障判定**：需要多数哨兵同意

### 配置示例

```text
# sentinel.conf
sentinel monitor mymaster 192.168.1.100 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
sentinel parallel-syncs mymaster 1
```

## 集群模式 (Cluster)

分布式解决方案，实现数据分片和高可用。

```text
+---------------------------------------------------+
|                  Redis Cluster                    |
+---------------------------------------------------+
|                                                   |
|  +-----------+       +-----------+       +-----------+ |
|  |  Master1  |<----->|  Master2  |<----->|  Master3  | |
|  | (0-5000)  |       |(5001-10000)|       |(10001-16383)| |
|  +-----------+       +-----------+       +-----------+ |
|       ^                    ^                    ^      |
|       |                    |                    |      |
|  +-----------+       +-----------+       +-----------+ |
|  |  Slave1   |       |  Slave2   |       |  Slave3   | |
|  +-----------+       +-----------+       +-----------+ |
|                                                   |
+---------------------------------------------------+
          ^         ^         ^
          |         |         |
      +-------+ +-------+ +-------+
      |Client1| |Client2| |Client3|
      +-------+ +-------+ +-------+
```

### 核心特性

- **自动分片**：数据分散在多个节点上，每个节点存储部分数据。
- **高可用性**：支持主从复制和故障自动转移。
- **去中心化**：节点间通过 Gossip 协议通信，无需代理节点。
- **客户端重定向**：客户端直接与集群交互，集群返回重定向指令。

### 数据分片机制

- **哈希槽（Hash Slot）**：
    - 集群将数据划分为 16384 个槽。
    - 每个键通过 `CRC16(key) mod 16384` 映射到一个槽。
    - 节点负责处理一个或多个槽。

#### 槽分配示例

- 节点A：槽 0-5000
- 节点B：槽 5001-10000
- 节点C：槽 10001-16383

#### 槽的状态

槽有以下三种状态：

1. **稳定状态**：槽被明确分配给某个节点。
2. **迁移中**：槽正在从源节点迁移到目标节点。
3. **导入中**：目标节点正在接收迁移的槽。

```text
客户端 → 源节点
    ↓
键存在 → 直接处理
    ↓
键已迁移 → 返回 ASK 重定向
    ↓
客户端 → 目标节点（发送 ASKING）
    ↓
目标节点处理请求
```

### 集群节点角色

- **主节点（Master）**：处理读写请求，负责槽管理。
- **从节点（Slave）**：复制主节点数据，主节点故障时接替其工作。

### 节点通信机制

- **Gossip 协议**：
    - 节点间通过 PING/PONG 消息交换状态信息（槽分配、节点在线状态等）。
    - 每个节点维护集群元数据。

- **故障检测**：
    - 节点定期向其他节点发送 PING。
    - 若目标节点未在指定时间内回复 PONG，则标记为疑似下线（PFAIL）。
    - 超过半数主节点确认故障后，标记为已下线（FAIL），触发故障转移。

### 请求路由方式

- **直接路由**：客户端请求的键由当前节点负责，直接返回结果。
- **重定向**：
    - **MOVED 错误**：键不属于当前节点，返回正确节点地址。
      ```text
      GET key
      MOVED 12539 192.168.1.2:6380  # 槽12539在节点192.168.1.2:6380
      ```
    - **ASK 错误**：键正在迁移中，临时重定向到目标节点。

### 故障转移

- **从节点选举**：
    - 主节点故障后，其从节点发起选举。
    - 其他主节点投票，得票最多的从节点升级为新主节点。
    - 新主节点接管故障主节点的槽。

## 高可用架构对比

| 特性维度   | 主从复制          | 哨兵模式             | 集群模式           |
|--------|---------------|------------------|----------------|
| 数据分布   | 全量复制，所有节点数据相同 | 全量复制，所有节点数据相同    | 数据分片，不同节点数据不同  |
| 高可用性   | 低（需手动故障转移）    | 高（自动故障转移）        | 高（自动故障转移+分片容错） |
| 扩展性    | 读扩展性好，写无法扩展   | 读扩展性好，写无法扩展      | 读写均可水平扩展       |
| 数据一致性  | 最终一致性（异步复制）   | 最终一致性（异步复制）      | 最终一致性（异步复制）    |
| 性能     | 读性能线性扩展       | 读性能线性扩展          | 读写性能均线性扩展      |
| 故障恢复   | 手动            | 自动（秒级）           | 自动（秒级）         |
| 网络分区处理 | 无             | 配置 quorum 避免脑裂   | 多数派原则，可配置副本迁移  |
| 客户端复杂度 | 简单            | 需支持 Sentinel API | 需支持 Cluster 协议 |
| 资源利用率  | 低（数据全冗余）      | 低（数据全冗余）         | 高（数据分布存储）      |
| 最大节点数  | 理论上无限制        | 理论上无限制           | 1000 个节点推荐     |
| 使用限制   | 无             | 不支持多数据库（仅 db0）   | 部分命令受限，事务限于单节点 |
| 部署复杂度  | 简单            | 中等               | 复杂             |

### 选择建议

#### 选择主从复制当：

- 只需要数据备份和读写分离
- 可以接受手动故障切换
- 预算有限，不需要自动高可用

#### 选择哨兵模式当：

- 需要高可用和自动故障转移
- 数据量不大，不需要水平扩展
- 已有客户端支持 Sentinel

#### 选择集群模式当：

- 数据量超过单机内存（如 100GB+）
- 需要高并发读写（10万+ QPS）
- 需要真正的水平扩展能力

### 生产环境建议

#### 小型应用

- **方案**：哨兵模式 + 1主2从
- **优点**：性价比最高

#### 中型应用

- **方案**：集群模式，3主3从，数据分片存储
- **优点**：高可用性和水平扩展能力

#### 大型应用

- **方案**：集群模式，根据数据量和并发动态扩展
- **优点**：灵活应对大规模数据和高并发需求

#### 数据安全

- **建议**：无论哪种方案，都要配合持久化（AOF+RDB）

#### 监控告警

- **建议**：必须部署监控系统（Prometheus + Grafana）