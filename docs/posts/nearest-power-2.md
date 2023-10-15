---
category:
  - 算法
tag:
  - 位运算
date: 2023-10-12
---

# 求一个数字最接近的2的N次幂

给定一个正整数`n`，现有正整数`x`，`x`满足以下条件：

- `x` >= `n`
- `x` 是 2的N次幂

求`x`的最小值。

例如：
```text
input: n = 6
output: 8

input: n = 8
output: 8

input: n = 20
output: 32
```

## JDK8的HashMap中的实现

`HashMap`会把构造函数中用户输入的`capacity`向上取到最接近的2的n次幂。

```java
/**
 * Returns a power of two size for the given target capacity.
 */
static final int tableSizeFor(int cap) {
    int n = cap - 1;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    return (n < 0) ? 1 : (n >= MAXIMUM_CAPACITY) ? MAXIMUM_CAPACITY : n + 1;
}
```

### Java移位运算符解释

#### 左移运算符：<<

丢弃左边指定位数，右边补0。

```text
Integer.MIN_VALUE == 0x80000000
(Integer.MIN_VALUE << 1) == 0

-1 == 0xffffffff
-1 << 1 == -2 // -2 == 0xfffffffe

1 << 1 == 2
```

#### 右移运算符：>>

丢弃右边指定位数，左边补上符号位。

```text
4 >> 1 == 2

0x80000000 >> 1 == 0xc0000000
0xffffffff >> 1 == 0xffffffff
```

#### 无符号右移运算符：>>>

丢弃右边指定位数，左边补上0。

```text
4 >> 1 == 2

0x80000000 >> 1 == 0x40000000
0xffffffff >> 1 == 0x7fffffff
```

## 算法解释

对于一个32位整数

```text
0000 0100 1000 0100 0000 0000 0000 0000
```

把最左边的`1`之后的位都填充为`1`

```text
0000 0111 1111 1111 1111 1111 1111 1111
```

然后再对这个数字+1

```text
0000 1000 0000 0000 0000 0000 0000 0000
```

得出的这个数字，就是最接近的2的N次幂。如果这个数字本身就是2的N次幂，那么得出的数字就是2的N+1次幂，所以可以对原数字`-1`后再位运算。

如果求的是小于等于n的最接近2的N次幂，只需要把上面的结果向右移一位。这种情况不需要对原数字`-1`。

```text
0000 0100 0000 0000 0000 0000 0000 0000 // 向右移一位
```

那么要怎么在最左边的1后填充0呢？

```text
0000 0100 1000 0100 0000 0000 0000 0000
0000 0110 1100 0110 0000 0000 0000 0000 // n | (n >>> 1)
0000 0111 1111 0111 1000 0000 0000 0000 // n | (n >>> 2)
0000 0111 1111 1111 1111 1000 0000 0000 // n | (n >>> 4)
0000 0111 1111 1111 1111 1111 1111 1000 // n | (n >>> 8)
0000 0111 1111 1111 1111 1111 1111 1111 // n | (n >>> 16)
```

通过右移运算和或运算，可以把后面都填充为1。