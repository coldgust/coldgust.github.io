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