---
category:
  - Java
  - Spring
tag:
  - 单元测试
date: 2023-10-10
star: true
---

# Java和Spring单元测试

- 单元测试目标是测试某一个代码单元（一般是一个函数），验证该单元是否能按预期工作。
- 集成测试是对某一个功能或者接口进行测试，因此单元测试的通过，并不意味着集成测试就能通过：局部上反映不出的问题，在全局上很可能会暴露出来。

## 单元测试

在编写单元测试时，不应该依赖任何外部依赖，不依赖与该测试无关的代码。在Spring应用中时，单元测试不应该依赖Spring，因为Spring启动需要把所有的bean注册到Spring容器中，与该测试无关的bean启动失败会导致测试失败。另外，我们还需要把Spring的各项配置正确才能启动单元测试。所以，单元测试应尽量不依赖Spring。对于外部依赖，例如数据库、RPC调用、HTTP调用等等，我们需要mock这部分实现，来保证单元测试的可重复执行性。

### 示例代码

我们后面大部分的单元测试都是基于示例代码去编写。依赖版本：`JDK 21`，`Springboot 3.1.4`，`Junit 5.9.3`，`Mockito 5.3.1`。

```java
@AllArgsConstructor
@Data
public class User {

    private String id;

    private String name;
}
```
```java
@Component
public class UserDao {

    public String getUserNameById(String id) {
        return "user: " + id;
    }

}
```
```java
@AllArgsConstructor
@Service
public class UserService {

    private final UserDao userDao;

    public User getUserById(String id) {
        if (id == null) {
            throw new IllegalArgumentException("id should not null");
        }
        return new User(id, userDao.getUserNameById(id));
    }
}
```
```java
@AllArgsConstructor
@RestController
@RequestMapping("/user")
public class UserController {

    private final UserService userService;

    @GetMapping("/{id}")
    public User getUserById(@PathVariable String id) {
        return userService.getUserById(id);
    }

    public int getAgeByName(String name) {
        return name.length();
    }
}
```

### 场景1：不依赖Spring的Mock

我们的目的是测试`UserService`类里的`getUserById`函数，所以我们需要mock `Dao`层，Dao层应该是去查询数据库的，这里为了示例方便，没有写查询数据库的逻辑。

```java
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class UserServiceTest {

    @Mock
    UserDao userDao;

    @InjectMocks
    UserService userService;

    @Test
    void shouldReturnCorrectUser() {
        when(userDao.getUserNameById(anyString()))
                .thenAnswer(invocationOnMock -> "mockUser: " + invocationOnMock.getArgument(0));
        User user = userService.getUserById("1");
        Assertions.assertEquals(new User("1", "mockUser: 1"), user);
    }

    @Test
    void shouldThrowWhenNull() {
        Assertions.assertThrows(IllegalArgumentException.class, () -> userService.getUserById(null));
    }
}
```
在使用`Mockito`时，需要在测试类上加上注解`@ExtendWith(MockitoExtension.class)`。`@Mock`注解创建mock对象，`@InjectMock`注解自动注入`@Mock`或者`@Spy`注解的mock对象。`when()`指定mock对象的行为。更多`Mockito`的使用可参考[这里](https://site.mockito.org)。

我们也可以不使用注解，使用函数创建mock对象的方式更为灵活。
```java
@ExtendWith(MockitoExtension.class)
public class UserServiceTest {

    @Test
    void shouldReturnCorrectUser() {
        UserDao userDao = mock();
        when(userDao.getUserNameById(anyString()))
                .thenAnswer(invocationOnMock -> "mockUser: " + invocationOnMock.getArgument(0));
        UserService userService = new UserService(userDao);
        User user = userService.getUserById("1");
        Assertions.assertEquals(new User("1", "mockUser: 1"), user);
    }

}
```

在这里我们没有依赖Spring，本应由Spring注入的对象，我们手动注入，这样的单元测试鲁棒性更好。我们也针对正常情况和异常情况分别测试，尽量覆盖所有边界场景。

### 场景2：多组单元测试

在上面的测试中，我们希望能有多组测试用例，而`@ParameterizedTest`可以帮助我们快速建立多组测试。`@MethodSource`提供参数源，常用的还有`@CsvSource`，`ValueSource`等等，更多用法可参考[这里](https://junit.org/junit5/docs/current/user-guide/#writing-tests-parameterized-tests)。

```java
@ExtendWith(MockitoExtension.class)
public class UserServiceTest {

    @Mock
    UserDao userDao;

    @InjectMocks
    UserService userService;

    @ParameterizedTest
    @MethodSource("userProvider")
    void shouldReturnCorrectUser(String id, User expect) {
        when(userDao.getUserNameById(anyString()))
                .thenAnswer(invocationOnMock -> "mockUser: " + invocationOnMock.getArgument(0));
        User user = userService.getUserById(id);
        Assertions.assertEquals(expect, user);
    }

    static Stream<Arguments> userProvider() {
        return Stream.of(
                Arguments.of("1", new User("1", "mockUser: 1")),
                Arguments.of("2", new User("2", "mockUser: 2")),
                Arguments.of("0", new User("0", "mockUser: 0"))
        );
    }
}
```

### 场景3：依赖Spring的Mock

尽管在写单元测试时，我们不希望测试依赖于Spring，但在某些情况下，依赖Spring会使得我们的测试更容易书写。

```java
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.util.stream.Stream;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@SpringBootTest
public class UserServiceSpringTest {

    @MockBean
    UserDao userDao;

    @Autowired
    UserService userService;

    @ParameterizedTest
    @MethodSource("userProvider")
    void shouldReturnCorrectUser(String id, User expect) {
        when(userDao.getUserNameById(anyString()))
                .thenAnswer(invocationOnMock -> "mockUser: " + invocationOnMock.getArgument(0));
        User user = userService.getUserById(id);
        Assertions.assertEquals(expect, user);
    }

    static Stream<Arguments> userProvider() {
        return Stream.of(
                Arguments.of("1", new User("1", "mockUser: 1")),
                Arguments.of("2", new User("2", "mockUser: 2")),
                Arguments.of("0", new User("0", "mockUser: 0"))
        );
    }
}
```

写法跟不依赖Spring的是类似的，只是使用了不同的注解。

### 场景4：Mock对象的部分方法

有时候，我们希望只mock对象的其中一个方法，其余方法调用真实的方法。使用`@Mock`或者`@MockBean`注解，会mock所有方法，没有使用`when()`或者`given()`函数打桩的方法将会返回`null`。我们可以使用`@Spy`或者`@SpyBean`注解代替，这个注解只会mock打桩的方法，其余方法调用真实的函数。

```java
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class UserServiceSpyTest {

    @Spy
    UserDao userDao;

    @InjectMocks
    UserService userService;

    @Test
    void shouldReturnCorrectUser() {
        doAnswer(invocationOnMock -> "mockUser: " + invocationOnMock.getArgument(0))
                .when(userDao).getUserNameById(anyString());
        User user = userService.getUserById("1");
        Assertions.assertEquals(new User("1", "mockUser: 1"), user);
        Assertions.assertEquals(user.getName().length(), userDao.getAgeByName(user.getName()));
    }

}
```

### 场景5：不使用mock工具mock

事实上，我们可以不依赖任何工具就可以mock。这种方法最为灵活，但有一定的局限性，例如无法mock静态方法。

```java
public class UserServiceSpyTest {

    @Test
    void shouldReturnCorrectUser() {
        UserDao userDao = new UserDao() {
            @Override
            public String getUserNameById(String id) {
                return "mockUser: " + id;
            }
        };
        UserService userService = new UserService(userDao);
        User user = userService.getUserById("1");
        Assertions.assertEquals(new User("1", "mockUser: 1"), user);
    }

}
```

### 场景6：Mock静态方法

有时候，我们希望能mock静态方法，尽管不建议滥用静态方法（静态方法是一种面向过程的编程思维）。由于mock静态需要修改字节码，相对而言mock成员方法只需要动态代理。所以，mock静态方法一般需要借助专门的mock工具。

```java
public class ConstUtil {

    public static String giveMeConstString() {
        return "abc";
    }
}
```
```java
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.mockStatic;

@ExtendWith(MockitoExtension.class)
public class ConstUtilTest {

    @Test
    void testStaticMethod() {
        Assertions.assertEquals("abc", ConstUtil.giveMeConstString());
        try (MockedStatic<ConstUtil> mocked = mockStatic(ConstUtil.class)) {
            mocked.when(ConstUtil::giveMeConstString).thenReturn("def");
            Assertions.assertEquals("def", ConstUtil.giveMeConstString());
            mocked.verify(ConstUtil::giveMeConstString);
        }
        Assertions.assertEquals("abc", ConstUtil.giveMeConstString());
    }
}
```
可以看到mock静态相对而言更为麻烦，使用`Mockito`mock静态方法，可能需要引入`inline mock maker`，可以参考[这里](https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/Mockito.html#48)。

### 场景7：代码可测试性问题

当我们发现去写一个方法的测试非常困难的时候，就可能是原本代码的可测试性比较差，需要去修改原来的代码提高可测试性。通常来说，以下行为会降低代码的可测试性（testability）。

#### 1. 未决行为

代码的输出是随机或者说不确定的，比如，跟时间、随机数有关的代码。

#### 2. 全局变量

全局变量是一种面向过程的编程风格，有种种弊端。实际上，滥用全局变量也让编写单元测试变得困难。当我们的被测函数依赖于全局变量时，其测试结果可能依赖于测试执行的顺序。

#### 3. 静态方法

静态方法跟全局变量一样，也是一种面向过程的编程思维。在代码中调用静态方法，有时候会导致代码不易测试。主要原因是静态方法也很难 mock。但是，这个要分情况来看。只有在这个静态方法执行耗时太长、依赖外部资源、逻辑复杂、行为未决等情况下，我们才需要在单元测试中 mock 这个静态方法。除此之外，如果只是类似
Math.abs() 这样的简单静态方法，并不会影响代码的可测试性，因为本身并不需要mock。

#### 4. 复杂继承

相比组合关系，继承关系的代码结构更加耦合、不灵活，更加不易扩展、不易维护。实际上，继承关系也更加难测试。

如果父类需要 mock 某个依赖对象才能进行单元测试，那所有的子类、子类的子类……在编写单元测试的时候，都要 mock 这个依赖对象。对于层次很深（在继承关系类图中表现为纵向深度）、结构复杂（在继承关系类图中表现为横向广度）的继承关系，越底层的子类要mock 的对象可能就会越多，这样就会导致，底层子类在写单元测试的时候，要一个一个mock 很多依赖对象，而且还需要查看父类代码，去了解该如何 mock 这些依赖对象。

如果我们利用组合而非继承来组织类之间的关系，类之间的结构层次比较扁平，在编写单元测试的时候，只需要 mock 类所组合依赖的对象即可。

#### 5. 高耦合代码

如果一个类职责很重，需要依赖十几个外部对象才能完成工作，代码高度耦合，那我们在编写单元测试的时候，可能需要mock这十几个依赖的对象。不管是从代码设计的角度来说，还是从编写单元测试的角度来说，这都是不合理的。

#### 示例

假设我们的心情依赖于当前的时间，当现在的时间的秒数是偶数，我们会感到高兴，当时间的秒数是奇数时，我们会感到难过。在`UserService`添加该函数。

```java
@AllArgsConstructor
@Service
public class UserService {

    private final UserDao userDao;

    public User getUserById(String id) {
        if (id == null) {
            throw new IllegalArgumentException("id should not null");
        }
        return new User(id, userDao.getUserNameById(id));
    }
    
    public String getUserMood() {
        long now = System.currentTimeMillis();
        if (now % 2 == 0) {
            return "happy";
        } else {
            return "sad";
        }
    }
}
```

这个函数虽然看起来简单，但这个测试并不那么容易写，最大的问题在于，该函数的返回值取决于时间。

我们有2种思路去解决这个问题：
- 使用mockito去mock`System.currentTimeMillis()`这个静态方法，但这种方法不推荐。
- 把未决行为分离出来，然后再去mock它。

```java
@AllArgsConstructor
@Service
public class UserService {

    private final UserDao userDao;

    public User getUserById(String id) {
        if (id == null) {
            throw new IllegalArgumentException("id should not null");
        }
        return new User(id, userDao.getUserNameById(id));
    }

    public String getUserMood() {
        long now = getCurrentTimeMillis();
        if (now % 2 == 0) {
            return "happy";
        } else {
            return "sad";
        }
    }
    
    public long getCurrentTimeMillis() {
        return System.currentTimeMillis();
    }
}
```

```java
@ExtendWith(MockitoExtension.class)
public class UserServiceMoodTest {

    UserService userService = Mockito.spy(new UserService(new UserDao()));

    @Test
    void shouldHappyWhenEven() {
        Mockito.doReturn(2L).when(userService).getCurrentTimeMillis();
        IntStream.range(0, 100).forEach(i -> Assertions.assertEquals("happy", userService.getUserMood()));
    }

    @Test
    void shouldSadWhenOdd() {
        Mockito.doReturn(1L).when(userService).getCurrentTimeMillis();
        IntStream.range(0, 100).forEach(i -> Assertions.assertEquals("sad", userService.getUserMood()));
    }
}
```

### 场景8：私有方法测试问题

私有方法按照正常的流程是没办法测试的，因为我们无法去调用一个私有方法，那么私有方法到底要不要测试，这是一个众说纷纭的问题。

如果我们要测试私有方法，可以使用以下两种方法：
- 去掉`private`修饰符

把private修饰符去掉，并且加上`@VisibleForTesting`表明该方法的可见性是为了测试。Google Guava中常用到。

```java
  @VisibleForTesting
  static boolean validSurrogatePairAt(CharSequence string, int index) {
    return index >= 0
        && index <= (string.length() - 2)
        && Character.isHighSurrogate(string.charAt(index))
        && Character.isLowSurrogate(string.charAt(index + 1));
  }
```

- 使用反射调用私有方法

这种方法不那么推荐，更推荐第一种方法。

```java
public class PrivateMethodTest {

    static class TestClass {
        private int getAge(int n) {
            return n + 18;
        }

    }

    @Test
    void testPrivateMethod() throws Exception {
        TestClass testClass = new TestClass();
        Method method = TestClass.class.getDeclaredMethod("getAge", int.class);
        method.setAccessible(true);
        int r = (int) method.invoke(testClass, 10);
        Assertions.assertEquals(28, r);
    }
}
```

## 集成测试

我们已经聊了足够多的单元测试，是时候来看看集成测试了。

### 单元测试的局限性

单元测试一般是以函数为单位，它能保证我们单个函数的准确性，但不能保证这些函数组合起来后的正确性。所以我们需要以功能为单位编写集成测试。对于Web应用而言，一般是以一个接口作为一个功能。

### Spring WebMvc的集成测试

```java
@SpringBootTest
@AutoConfigureMockMvc
public class UserControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    public void shouldReturnCorrectUser() throws Exception {
        ObjectMapper om = new ObjectMapper();
        mockMvc.perform(MockMvcRequestBuilders.get("/user/10"))
                .andDo(MockMvcResultHandlers.print())
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.content()
                        .string(om.writeValueAsString(new User("10", "user: 10"))));

    }
}
```

同样，我们也可以mock Dao层，

```java
@SpringBootTest
@AutoConfigureMockMvc
public class UserControllerTest {

    @Autowired
    MockMvc mockMvc;

    @SpyBean
    UserDao userDao;

    @Test
    public void shouldReturnCorrectUser() throws Exception {
        doAnswer(invocationOnMock -> "mockUser: " + invocationOnMock.getArgument(0))
                .when(userDao).getUserNameById(anyString());
        ObjectMapper om = new ObjectMapper();
        mockMvc.perform(MockMvcRequestBuilders.get("/user/10"))
                .andDo(MockMvcResultHandlers.print())
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.content()
                        .string(om.writeValueAsString(new User("10", "mockUser: 10"))));

    }
}
```

## E2E测试

E2E 是“End to End”的缩写，可以翻译成“端到端”测试。它模仿用户，从某个入口开始，逐步执行操作，直到完成某项工作。执行端到端测试的目的是识别系统依赖关系，并确保在各种系统组件和系统之间传递正确的信息。端到端测试的目的是测试 整个软件的依赖性、数据完整性以及与其他系统、接口和数据库的通信，以模拟完整的生产场景。

在E2E测试中，我们可以使用docker构建整一套依赖环境，去模拟真实的生产环境。