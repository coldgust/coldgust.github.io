---
category:
  - Java
tag:
  - 虚拟线程
date: 2023-10-07
---

# Java 虚拟线程（virtual thread）

虚拟线程是轻量级线程，可以减少编写、维护和调试高吞吐量并发应用程序的工作量。虚拟线程在`JDK 19`中作为预览特性引入，在`JDK 21`中作为正式特性引入。

在其它语言中也有类似于虚拟线程的技术，例如`Go`中的`goroutine`。

关于虚拟线程的背景信息可以参考：[JEP 444](https://openjdk.org/jeps/444)。

线程是最小的可调度单元，多个线程可以并发运行，在很大程度上，它们之间是独立运行的。 线程是`java.lang.Thread`的一个实例。线程分为两种类型：平台线程（platform thread）和虚拟线程（virtual thread）。

## 什么是平台线程（platform thread）

平台线程是对操作系统线程的包装实现。平台线程在其底层操作系统线程上运行Java代码，在其生命周期内都与一个操作系统线程绑定。因此，可用的平台线程数量受限于操作系统线程的数量。

平台线程通常有一个大的线程堆栈和其他由操作系统维护的资源。它们适合运行所有类型的任务，但其可用的资源受限于操作系统的线程数量。

## 什么是虚拟线程（virtual thread）

与平台线程一样，虚拟线程也是`java.lang.Thread`的一个实例。然而，虚拟线程并不绑定到特定的操作系统线程。

虚拟线程仍然在操作系统线程上运行代码，但是，当运行在虚拟线程中的代码调用阻塞I/O（blocking I/O）时，Java runtime会挂起该虚拟线程，直到它可以被恢复。与挂起的虚拟线程相关联的操作系统线程，可以为其它虚拟线程执行操作。

虚拟线程与虚拟内存的实现有点类似，为了模拟大量内存，操作系统将一个大的虚拟地址空间映射到数量有限的物理内存。类似地，为了模拟大量线程，Java运行时将大量虚拟线程映射到少量操作系统线程。

与平台线程不同，虚拟线程的调用栈通常更浅，例如只执行一个HTTP调用或者一次JDBC查询。尽管虚拟线程支持线程局部变量（thread-local variables）和可继承的线程局部变量（inheritable thread-local variables），但您应该仔细考虑使用它们，因为单个JVM可能支持数百万个虚拟线程。

虚拟线程适合运行大部分时间被阻塞的任务（I/O密集型任务），这些任务通常等待I/O操作完成。然而，**它们并不适合的cpu密集型任务**，这些任务通常需要长时间占用cpu。

## 为什么要使用虚拟线程？

在高吞吐量高并发的应用程序中使用虚拟线程，尤其是那些需要大量时间等待的并发任务组成的应用程序。例如，服务端程序就是高吞吐量高并发的应用，因为它们通常需要处理大量的客户端请求，里面通常有阻塞I/O操作（例如请求资源）。

虚拟线程不是更快的线程，它们运行代码不会比平台线程快。它们的存在是为了提供可伸缩性(更高的吞吐量)，而不是速度(更低的延迟)。

## 创建和运行虚拟线程

`Thread`和`Thread.Builder`都可以用来创建虚拟线程和平台线程。`java.util.concurrent.Executors`类提供可以给每个任务创建虚拟线程的`ExecutorService`。

### 用`Thread`类和`Thread.Builder`接口创建虚拟线程

调用`Thread.ofVirtual()`方法创建`Thread.Builder`的一个实例去创建虚拟线程。

下面的例子创建和启动了一个打印信息的虚拟线程。它调用`join`方法来等待虚拟线程结束（这可以让你看到打印的信息在main线程终止前）。

```java
Thread thread = Thread.ofVirtual().start(() -> System.out.println("Hello"));
thread.join();
```

`Thread.Builder`接口可以让你创建带有属性（例如线程名称）的线程。接口`Thread.Builder.OfPlatform`用来创建平台线程，而`Thread.Builder.OfVirtual`用来创建虚拟线程。

下面的例子使用`Thread.Builder`接口创建了一个名为`MyThread`的虚拟线程。

```java
Thread.Builder builder = Thread.ofVirtual().name("MyThread");
Runnable task = () -> {
    System.out.println("Running thread");
};
Thread t = builder.start(task);
System.out.println("Thread t name: " + t.getName());
t.join();
```

下面的例子使用`Thread.Builder`创建和启动了两个虚拟线程。

```java
Thread.Builder builder = Thread.ofVirtual().name("worker-", 0);
Runnable task = () -> {
    System.out.println("Thread ID: " + Thread.currentThread().threadId());
};

// name "worker-0"
Thread t1 = builder.start(task);   
t1.join();
System.out.println(t1.getName() + " terminated");

// name "worker-1"
Thread t2 = builder.start(task);   
t2.join();  
System.out.println(t2.getName() + " terminated");
```

输出如下：
```text
Thread ID: 21
worker-0 terminated
Thread ID: 24
worker-1 terminated
```

### 使用`Executors.newVirtualThreadPerTaskExecutor()`方法创建和运行虚拟线程

Executors允许你将线程的创建和管理与应用程序的其它部分分开。

下面的例子使用`Executors.newVirtualThreadPerTaskExecutor()`创建`ExecutorService`。当`ExecutorService.submit(Runnable)`被调用，就会创建一个虚拟线程去执行任务。这个方法返回`Future`的一个实例。`Future.get()`会等待直到线程任务完成。所以，这个例子会打印一条信息当线程任务完成后。

```java
try (ExecutorService myExecutor = Executors.newVirtualThreadPerTaskExecutor()) {
    Future<?> future = myExecutor.submit(() -> System.out.println("Running thread"));
    future.get();
    System.out.println("Task completed");
    // ...
```

### 多线程客户端服务器例子

未完待续...

## Reference

1. [Virtual Threads](https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html)