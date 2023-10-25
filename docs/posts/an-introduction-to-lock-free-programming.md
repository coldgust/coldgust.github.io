---
category:
  - 并发编程
  - 无锁编程
tag:
  - 无锁并发
  - 译文
date: 2023-10-26
star: true
---

# 无锁编程简介

无锁编程是一项挑战，不仅因为任务本身的复杂性，还因为要深入理解这个主题是非常困难的。

我第一次介绍无锁（lock-free，又称为lockless）编程是Bruce Dawson优秀而全面的白皮书《[Lockless Programming Considerations](http://msdn.microsoft.com/en-us/library/windows/desktop/ee418650(v=vs.85).aspx)》。和很多人一样，我也有机会将Bruce的建议付诸实践，在Xbox 360等平台上开发和调试无锁代码。

从那时起，已经写了很多好的材料，从抽象理论和正确性证明到实际示例和硬件细节。我将在脚注中列出参考书目。有时，一个源中的信息可能看起来与其他源正交:例如，一些材料假定[顺序一致性](http://en.wikipedia.org/wiki/Sequential_consistency)，从而避免了通常困扰无锁C/C++代码的内存排序问题。新的[C++11 atomic library standard](http://en.cppreference.com/w/cpp/atomic)给工作带来了另一个难题，挑战了我们许多人表达无锁算法的方式。

在这篇文章中，我想重新介绍无锁编程，首先定义它，然后将大部分信息提炼成几个关键概念。我将用流程图展示这些概念是如何相互关联的，然后我们将深入到细节中去。至少，任何深入研究无锁编程的程序员都应该已经了解如何使用互斥锁和其他高级同步对象，如信号量（semaphores）和事件（events），用其编写正确的多线程代码。

## 什么是无锁编程

人们通常将无锁编程描述为不使用互斥锁（mutex）的编程，互斥锁又称为[lock](http://preshing.com/20111118/locks-arent-slow-lock-contention-is)。这是事实，但这是其中一部分。基于学术文献的普遍接受的定义更广泛一些。从本质上讲，无锁是一个用于描述某些代码的属性，而不需要过多地说明这些代码实际上是如何编写的。

基本上，如果程序的某些部分满足以下条件，那么该部分可以被正确地认为是无锁的。相反，如果代码的给定部分不满足这些条件，那么该部分就不是无锁的。

![Lock free programing.png](images/lock-free-%20programing.png)

从这个意义上说，无锁编程中的锁并不是指互斥锁（mutex），而是指以某种方式“锁定”整个应用程序的可能性，无论是死锁、活锁，甚至是由于你的死敌所做的假想线程调度决策。最后一点听起来很滑稽，但却是关键所在。共享互斥锁是不可能的，因为只要一个线程获得了互斥，你的死对头就再也不会调度该线程了。当然，真正的操作系统不是这样工作的——我们只是在定义术语。

这个示例没有使用互斥锁（mutex），但它仍然不是无锁的。开始时，`X = 0`。作为对读者的练习，考虑如何以一种不让两个线程退出循环的方式调度两个线程。

```c
while (X == 0)
{
    X = 1 - X;
}
```

没有人期望大型应用程序完全没有锁。通常，我们从整个代码库中识别出一组特定的无锁操作。例如，在无锁队列中，可能有一些无锁操作，如`push`、`pop`，可能还有`isEmpty`等等。

Herlihy & Shavit，[The Art of Multiprocessor Programming](http://www.amazon.com/gp/product/0123973376/ref=as_li_ss_tl?ie=UTF8&tag=preshonprogr-20&linkCode=as2&camp=1789&creative=390957&creativeASIN=0123973376)的作者，倾向于用类方法（class method）来表达这样的操作，并给出了无锁的简洁定义(见150页)：“在无限次执行中，无限次地有一些方法调用结束”。换句话说，只要程序能够继续调用那些无锁操作，完成调用的数量就会不断增加。从算法上看，在这些操作期间系统不可能锁定。

无锁编程的一个重要结果是，如果挂起单个线程，它永远不会阻止同一个整体内的其他线程执行自己的无锁操作。这暗示了在编写中断处理程序和实时系统时无锁编程的价值，在这些系统中，某些任务必须在特定的时间限制内完成，而不管程序的其余部分处于什么状态。

最后的精度：设计为阻塞的操作不会使算法失效。队列为空时，队列的`pop`操作可能会故意阻塞。其余的代码仍可视为无锁。

## 无锁编程技术

未完待续...

## Reference

1. 翻译自：[An Introduction to Lock-Free Programming](https://preshing.com/20120612/an-introduction-to-lock-free-programming/)