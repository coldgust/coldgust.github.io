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

与平台线程不同，虚拟线程的调用栈通常更浅，例如只执行一个HTTP调用或者一次JDBC查询。尽管虚拟线程支持线程局部变量（thread-local variables）和可继承的线程局部变量（inheritable thread-local variables），但您应该仔细考虑使用它们，因为单个JVM可能运行数百万个虚拟线程。

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

下面的例子有2个类组成。`EchoServer`是一个服务端程序，它监听端口和为每个连接启动一个虚拟线程。`EchoClient`是一个客户端程序，它连接到服务端程序，发送命令行的输入。

`EchoClient`创建一个socket，从而连接到`EchoServer`。它从用户的标准输入流读取输入，然后将文本写入到socket发送到`EchoServer`。`EchoServer`将信息通过socket回显到`EchoClient`。`EchoClient`将从服务端接收的信息显示出来。`EchoServer`可以通过虚拟线程同时为多个客户端服务，每个客户端一个虚拟线程。

```java
public class EchoServer {
    
    public static void main(String[] args) throws IOException {
         
        if (args.length != 1) {
            System.err.println("Usage: java EchoServer <port>");
            System.exit(1);
        }
         
        int portNumber = Integer.parseInt(args[0]);
        try (
            ServerSocket serverSocket =
                new ServerSocket(Integer.parseInt(args[0]));
        ) {                
            while (true) {
                Socket clientSocket = serverSocket.accept();
                // Accept incoming connections
                // Start a service thread
                Thread.ofVirtual().start(() -> {
                    try (
                        PrintWriter out =
                            new PrintWriter(clientSocket.getOutputStream(), true);
                        BufferedReader in = new BufferedReader(
                            new InputStreamReader(clientSocket.getInputStream()));
                    ) {
                        String inputLine;
                        while ((inputLine = in.readLine()) != null) {
                            System.out.println(inputLine);
                            out.println(inputLine);
                        }
                    
                    } catch (IOException e) { 
                        e.printStackTrace();
                    }
                });
            }
        } catch (IOException e) {
            System.out.println("Exception caught when trying to listen on port "
                + portNumber + " or listening for a connection");
            System.out.println(e.getMessage());
        }
    }
}
```
```java
public class EchoClient {
    public static void main(String[] args) throws IOException {
        if (args.length != 2) {
            System.err.println(
                "Usage: java EchoClient <hostname> <port>");
            System.exit(1);
        }
        String hostName = args[0];
        int portNumber = Integer.parseInt(args[1]);
        try (
            Socket echoSocket = new Socket(hostName, portNumber);
            PrintWriter out =
                new PrintWriter(echoSocket.getOutputStream(), true);
            BufferedReader in =
                new BufferedReader(
                    new InputStreamReader(echoSocket.getInputStream()));
        ) {
            BufferedReader stdIn =
                new BufferedReader(
                    new InputStreamReader(System.in));
            String userInput;
            while ((userInput = stdIn.readLine()) != null) {
                out.println(userInput);
                System.out.println("echo: " + in.readLine());
                if (userInput.equals("bye")) break;
            }
        } catch (UnknownHostException e) {
            System.err.println("Don't know about host " + hostName);
            System.exit(1);
        } catch (IOException e) {
            System.err.println("Couldn't get I/O for the connection to " +
                hostName);
            System.exit(1);
        } 
    }
}
```

## 虚拟线程调度和固定（Pinned）虚拟线程

平台线程由操作系统调度其何时运行，虚拟线程由Java Runtime调度决定其何时运行。当Java Runtime调度虚拟线程时，它被分配（assign）或者挂载（mount）到平台线程上，然后由操作系统调度平台线程。这个平台线程称为载体（carrier）。在运行了一些代码后，虚拟线程可以从其载体卸载，这通常在虚拟线程执行了阻塞I/O操作后发生。在虚拟线程卸载其载体后，这个载体可以被Java Runtime挂载上其它的虚拟线程。

当虚拟线程固定(Pinned)到其载体上时，它在阻塞操作期间不能从载体上卸载。虚拟线程在以下情况下被固定：

- 虚拟线程在`synchronized`代码块或者方法内运行代码
- 虚拟线程运行`native`方法或者外部函数（[foreign function](https://docs.oracle.com/en/java/javase/21/core/foreign-function-and-memory-api.html)）。

固定（Pinned）不会使程序出错，但可能会阻碍伸缩性。尝试修改频繁运行的`synchronized`代码块，使用`java.util.concurrent.locks.ReentrantLock`作为替代保护可能长时间的I/O操作，从而避免长时间的Pinned。

## Debug虚拟线程

虚拟线程仍然是线程，debugger可以像平台线程一样逐步调试。JDK Flight Recorder和`jcmd`工具具有额外的功能，可以帮助您观察应用程序中的虚拟线程。

### JDK Flight Recorder Events

JDK Flight Recorder (JFR)可以发出这些与虚拟线程相关的事件:

- `jdk.VirtualThreadStart`和`jdk.VirtualThreadEnd`表示虚拟线程的开始和结束。这些事件默认是关闭的。
- `jdk.VirtualThreadPinned`表示一个虚拟线程被固定（其载体线程没有释放）的时间超过了阈值时间。该时间默认启用，其阈值时间为20ms。
- `jdk.VirtualThreadSubmitFailed`表示启动或者恢复（unpark）一个虚拟线程失败，可能的原因是资源问题。`park`一个虚拟线程释放底层的载体线程去做其他工作，`unpark`一个虚拟线程调度它继续。该事件默认开启。

通过JDK Mission Control或者自定义JFR configuration（参考[这里](https://docs.oracle.com/en/java/javase/21/jfapi/flight-recorder-configurations.html)）启用`jdk.VirtualThreadStart`和`jdk.VirtualThreadEnd`事件。

要打印这些事件，请运行以下命令，其中`recording.jft`是你的record文件名:

```shell
jfr print --events jdk.VirtualThreadStart,jdk.VirtualThreadEnd,jdk.VirtualThreadPinned,jdk.VirtualThreadSubmitFailed recording.jfr
```

### 使用`jcmd`dump虚拟线程

你可以创建thread dump的文本格式或者json格式：

```shell
jcmd <PID> Thread.dump_to_file -format=text <file>
jcmd <PID> Thread.dump_to_file -format=json <file>
```

json格式对于能使用的调试工具来说更好。

jcmd thread dump列出在网络IO阻塞和由`ExecutorService`接口创建的虚拟线程。这不包括object addresses, locks, JNI statistics, heap statistics和其它在平台线程出现的信息。

## 虚拟线程使用指南

虚拟线程由Java Runtime实现而不是操作系统。虚拟线程和传统线程(我们称之为平台线程)之间的主要区别在于，我们可以很容易地在同一个Java进程中运行大量活动的虚拟线程，甚至数百万个。大量的虚拟线程赋予了它们强大的功能:通过允许服务器并发处理更多的请求，它们可以更有效地运行以每个请求一个线程的方式编写的服务器应用程序，从而实现更高的吞吐量和更少的硬件浪费。

由于虚拟线程是`java.lang.thread`的实现，并且遵循自Java SE 1.0以来指定`java.lang.threa`d的相同规则，因此开发人员不需要学习使用它们的新概念。由于无法生成非常多的平台线程，因此产生了应对创建平台线程的高成本的实践。当把这些实践应用到虚拟线程时会适得其反。此外，由于创建平台线程和虚拟线程的成本存在巨大的差异，我们需要一些新的方法。

该指南并不打算全面介绍虚拟线程的每一个重要细节。它只是为了提供一组介绍性的指导方针，以帮助那些希望开始使用虚拟线程的人充分利用它们。

### 使用一个请求一个线程的风格编写简单、同步的阻塞IO代码

未完待续...

## Reference

1. [Virtual Threads](https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html)